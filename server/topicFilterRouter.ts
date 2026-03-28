import { Router } from 'express';
import { getTursoClient } from './db.js';
import { verifyToken } from './userRouter.js';
import { validateAdminToken } from './adminAuth.js';
import fetch from 'node-fetch';
import OpenAI from 'openai';

export const topicFilterRouter = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// We can cache syllabus extraction globally since multiple users might use the same syllabus text string
const syllabusCache = new Map<string, any>();

topicFilterRouter.get('/check-cache', async (req, res) => {
  const { syllabusCode } = req.query;
  if (!syllabusCode || typeof syllabusCode !== 'string') return res.json({ cached: false });
  const client = getTursoClient();
  if (!client) return res.json({ cached: false });
  try {
    const rs = await client.execute({ sql: `SELECT topics_json FROM syllabus_data WHERE syllabus_code = ?`, args: [syllabusCode] });
    if (rs.rows.length > 0) {
      const topicsStr = rs.rows[0].topics_json as string;
      if (topicsStr) {
        try {
          const topics = JSON.parse(topicsStr);
          return res.json({ cached: true, topicCount: topics.length });
        } catch (err) {
          return res.json({ cached: false });
        }
      }
    }
    return res.json({ cached: false });
  } catch (err) {
    console.error("Failed to check syllabus cache:", err);
    return res.json({ cached: false });
  }
});

topicFilterRouter.post('/filter-questions', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = auth.split(' ')[1];
    
    const client = getTursoClient();
    if (!client) return res.status(500).json({ error: 'DB Error' });

    // Validate Session
    const sessionRs = await client.execute({
      sql: `SELECT s.user_id, u.tokens, u.username 
            FROM user_sessions s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP`,
      args: [token]
    });

    if (sessionRs.rows.length === 0) return res.status(401).json({ error: 'Session expired or invalid' });
    const session = sessionRs.rows[0];
    const isAdmin = session.user_id === 0;

    if (!isAdmin && (session.tokens as number) <= 0) {
      return res.status(403).json({ error: 'Token limit reached.' });
    }

    const userId = session.user_id as number;
    let { syllabusText, questions, syllabusCode } = req.body;
    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Missing questions array' });
    }

    let topics = null;
    if (client && syllabusCode) {
      try {
        const rs = await client.execute({ sql: `SELECT topics_json FROM syllabus_data WHERE syllabus_code = ?`, args: [syllabusCode] });
        if (rs.rows.length > 0) {
          const str = rs.rows[0].topics_json as string;
          if (str) {
            const parsed = JSON.parse(str);
            // Filter out parent-only IDs (e.g. "1", "2") if sub-units exist for that parent
            const subUnitParents = new Set<string>();
            for (const t of parsed) {
              if (t.unitId && t.unitId.includes('.')) subUnitParents.add(t.unitId.split('.')[0]);
            }
            const filtered = parsed.filter((t: any) => t.unitId && (t.unitId.includes('.') || !subUnitParents.has(t.unitId)));
            // If cached topics are all parent-level (bad old data), treat as uncached so AI re-extracts
            topics = filtered.length > 0 ? filtered : null;
          }
        }
      } catch (err) {
        console.error("Failed to query syllabus_data (topics):", err);
      }
    }

    if (!topics && !syllabusText) {
       return res.status(400).json({ error: 'Missing syllabusText (not cached)' });
    }

    if (!topics && syllabusText) {
      let subjectContentMatch = syllabusText.toLowerCase().indexOf('subject content', 8000);
      if (subjectContentMatch === -1) subjectContentMatch = syllabusText.search(/subject\s+content/i);
      if (subjectContentMatch !== -1) {
        const detailsMatch = syllabusText.substring(subjectContentMatch).search(/details\s+of\s+the\s+assessment|glossary|appendix/i);
        if (detailsMatch !== -1) {
          syllabusText = syllabusText.substring(subjectContentMatch, subjectContentMatch + detailsMatch);
        } else {
          syllabusText = syllabusText.substring(subjectContentMatch);
        }
      }
    }

    if (!topics) {
      const extractionCompletion = await openai.chat.completions.create({
        model: "gpt-5-nano",
        messages: [
          {
            role: "system",
            content: "Extract Cambridge syllabus topics from the given text. Output JSON: {\"topics\": [{\"unitId\": \"3.1\", \"title\": \"...\", \"content\": \"keyword1, keyword2, ...\"}]}. Rules: (1) unitId must exactly match the printed section number — never invent numbers. (2) If a section has sub-units (e.g. '1.1', '1.2', '1.3'), include ONLY the sub-units, not the parent '1'. (3) If a section has NO sub-units (e.g. '7 Algorithm design', '9 Databases', '10 Boolean logic'), include it using its number as unitId (e.g. '7', '9', '10') — do NOT skip these. (4) content = dense comma-separated keywords, acronyms, named concepts from ALL learning objectives and notes — omit filler words, keep technical terms verbatim."
          },
          {
            role: "user",
            content: "Syllabus text:\n" + syllabusText
          }
        ],
        response_format: { type: 'json_object' }
      });

      const raw = extractionCompletion.choices[0].message.content || '{}';
      try {
        const parsed = JSON.parse(raw);
        let arr = parsed.topics || parsed;
        if (!Array.isArray(arr)) arr = Object.values(arr).find((v: any) => Array.isArray(v)) ?? [];
        topics = arr;
      } catch {
        topics = [];
      }

      // Post-process: filter out fake deep sub-topics (e.g. "4.1.1", "5.3.2") — GPT invents these for "continued" pages
      topics = topics.filter((t: any) => {
        if (!t.unitId) return false;
        const dotCount = (t.unitId.match(/\./g) || []).length;
        return dotCount <= 1; // allow "1.1", "7" but not "4.1.1"
      });

      // Post-process: merge "continued" entries that GPT created for the same unitId with a slightly wrong number
      // e.g. if "7.1", "7.4", "7.9" all have title containing "Algorithm design" — renumber them 7.1, 7.2, 7.3
      // Group by parent, then sort by their raw sub-number and reassign sequential unitIds
      const subsByParent = new Map<string, any[]>();
      for (const t of topics) {
        if (t.unitId && t.unitId.includes('.')) {
          const parent = t.unitId.split('.')[0];
          if (!subsByParent.has(parent)) subsByParent.set(parent, []);
          subsByParent.get(parent)!.push(t);
        }
      }
      for (const [parent, subs] of subsByParent.entries()) {
        // Only renumber if they're non-consecutive (gap > 1 or doesn't start from 1)
        const nums = subs.map(t => parseInt(t.unitId.split('.')[1])).sort((a, b) => a - b);
        const startsFromOne = nums[0] === 1;
        const isConsecutive = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
        if (!startsFromOne || !isConsecutive) {
          // Sort by their original sub-number and reassign 1, 2, 3...
          subs.sort((a, b) => parseInt(a.unitId.split('.')[1]) - parseInt(b.unitId.split('.')[1]));
          subs.forEach((t, i) => { t.unitId = `${parent}.${i + 1}`; });
        }
      }

      // Post-process: filter out pure parent IDs (e.g. "1", "2") if there are sub-units present for that parent
      const hasSubUnit = new Set<string>();
      for (const t of topics) {
        if (t.unitId && t.unitId.includes('.')) {
          hasSubUnit.add(t.unitId.split('.')[0]);
        }
      }
      topics = topics.filter((t: any) => t.unitId && (t.unitId.includes('.') || !hasSubUnit.has(t.unitId)));

      try {
        if (client && syllabusCode && topics.length > 0) {
          // Clear stale question mappings for this syllabus so they get re-classified with new topics
          await client.execute({
            sql: `DELETE FROM paper_questions_data WHERE paper_id LIKE ?`,
            args: [syllabusCode.toLowerCase() + '%']
          });
          await client.execute({
            sql: `UPDATE syllabus_data SET topics_json = ? WHERE syllabus_code = ?`,
            args: [JSON.stringify(topics), syllabusCode]
          });
        }
      } catch (e) {
        console.error("OpenAI JSON parsing error (topics):", e);
        return res.status(500).json({ error: 'Failed to extract topics from syllabus. Try again.' });
      }
    }

    // --- Paper-Centric Logic ---
    const resultMapping: Record<string, string> = {};
    const questionsByPaper: Record<string, any[]> = {};
    for (const q of questions) {
      const lastUnderscore = q.id.lastIndexOf('_');
      if (lastUnderscore === -1) continue;
      const paperId = q.id.substring(0, lastUnderscore).toLowerCase();
      if (!questionsByPaper[paperId]) questionsByPaper[paperId] = [];
      questionsByPaper[paperId].push(q);
    }

    const papersToProcess = Object.keys(questionsByPaper);
    let tokensDeductedForPapers = 0;

    if (client && papersToProcess.length > 0) {
      try {
        const placeholders = papersToProcess.map(() => '?').join(',');
        const rs = await client.execute({
          sql: `SELECT paper_id, data_json FROM paper_questions_data WHERE paper_id IN (${placeholders})`,
          args: papersToProcess
        });

        const paperCache: Record<string, any> = {};
        for (const row of rs.rows) {
          paperCache[(row.paper_id as string).toLowerCase()] = JSON.parse(row.data_json as string);
        }

        // Process each paper
        // Pre-compute once outside the loop
        const topicSubUnitParents = new Set<string>();
        for (const t of topics) {
          if (t.unitId && t.unitId.includes('.')) topicSubUnitParents.add(t.unitId.split('.')[0]);
        }
        const isParentOnlyId = (id: string) => !id.includes('.') && topicSubUnitParents.has(id);
        const topicsCompact = topics.map((t: any) => ({ unitId: t.unitId, content: t.content }));
        const topicsCompactJson = JSON.stringify(topicsCompact);

        // Process all papers in parallel
        const paperResults = await Promise.all(papersToProcess.map(async (paperId) => {
          const paperQs = questionsByPaper[paperId];
          const cachedMappingsRaw = paperCache[paperId] || {};
          const cachedMappings: Record<string, string> = {};
          Object.keys(cachedMappingsRaw).forEach(k => { cachedMappings[k.toLowerCase()] = cachedMappingsRaw[k]; });

          const unmappedForThisPaper = paperQs.filter(q => {
            const mapped = cachedMappings[q.id.toLowerCase()];
            return !mapped || isParentOnlyId(mapped);
          });

          if (unmappedForThisPaper.length === 0) {
            return { paperId, paperQs, newPaperMapping: cachedMappingsRaw, didCallGpt: false };
          }

          console.log(`[FILTER] Paper ${paperId} has ${unmappedForThisPaper.length} unmapped questions. Calling GPT...`);

          const qString = unmappedForThisPaper.map((q: any) => {
            let text = String(q.text || '').replace(/\.{4,}/g, ' ').replace(/_{4,}/g, ' ');
            return `FULL_ID:"${q.id}" | ${text.substring(0, 200)}`;
          }).join('\n');

          try {
            const classificationCompletion = await openai.chat.completions.create({
              model: "gpt-5-nano",
              messages: [
                {
                  role: "system",
                  content: "Map each exam question to its syllabus topic. Each question has a FULL_ID — copy it EXACTLY as the 'id' field. Output JSON: {\"classifications\": [{\"id\": \"<FULL_ID verbatim>\", \"unitId\": \"1.1\"}, ...]}. One entry per input line. Match using topic content keywords. Always pick the most specific sub-unit (e.g. '3.1' not '3'). Flat array, no grouping."
                },
                {
                  role: "user",
                  content: `Topics:\n${topicsCompactJson}\n\nQuestions:\n${qString}`
                }
              ],
              response_format: { type: 'json_object' }
            });

            const cContent = classificationCompletion.choices[0].message.content || '{"classifications": []}';
            console.log(`[FILTER_RAW] GPT response for ${paperId}:`, cContent.substring(0, 300));

            const parsed = JSON.parse(cContent);
            const parsedSet: any[] = Array.isArray(parsed)
              ? parsed
              : (Object.values(parsed).find(v => Array.isArray(v)) as any[] || []);

            console.log(`[FILTER] Paper ${paperId} GPT returned ${parsedSet.length} classifications`);

            const newPaperMapping: Record<string, string> = { ...cachedMappingsRaw };
            for (const item of parsedSet) {
              if (item.classifications && Array.isArray(item.classifications)) {
                for (const cls of item.classifications) {
                  const id = cls.id || cls.questionId || item.FULL_ID || item.fullId;
                  const unitId = cls.unitId || cls.unit_id || cls.topicId;
                  if (id && unitId) newPaperMapping[id] = unitId;
                }
              } else {
                const id = item.id || item.questionId || item.FULL_ID || item.fullId;
                const unitId = item.unitId || item.unit_id || item.topicId || item.topic;
                if (id && unitId) newPaperMapping[id] = unitId;
              }
            }
            return { paperId, paperQs, newPaperMapping, didCallGpt: true };
          } catch (e) {
            console.error("[JSON_ERROR] Paper:", paperId, e);
            return { paperId, paperQs, newPaperMapping: cachedMappingsRaw, didCallGpt: false };
          }
        }));

        // Save new mappings to DB and build resultMapping
        await Promise.all(paperResults.map(async ({ paperId, paperQs, newPaperMapping, didCallGpt }) => {
          if (didCallGpt) {
            await client.execute({
              sql: `INSERT OR REPLACE INTO paper_questions_data (paper_id, data_json) VALUES (?, ?)`,
              args: [paperId, JSON.stringify(newPaperMapping)]
            });
            tokensDeductedForPapers++;
          }
          for (const q of paperQs) {
            const qIdLow = q.id.toLowerCase();
            if (newPaperMapping[q.id]) {
              resultMapping[q.id] = newPaperMapping[q.id];
            } else {
              const matchKey = Object.keys(newPaperMapping).find(k => k.toLowerCase() === qIdLow);
              if (matchKey) resultMapping[q.id] = newPaperMapping[matchKey];
            }
          }
        }));
      } catch (err) {
        console.error("Critical mapping error:", err);
      }
    }

    let newLimit = (session.tokens as number) || 0;
    if (!isAdmin && client && tokensDeductedForPapers > 0) {
      const cost = 10;
      await client.execute({ sql: `UPDATE users SET tokens = tokens - ? WHERE id = ?`, args: [cost, userId] });
      newLimit -= cost;
    }

    res.json({ mappings: resultMapping, topics, newLimit, cost: tokensDeductedForPapers > 0 ? 10 : 0 });
  } catch (err: any) {
    console.error("Filter Error:", err);
    res.status(500).json({ error: err.message });
  }
});
