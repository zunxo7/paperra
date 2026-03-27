import { Router } from 'express';
import { getTursoClient } from './db.js';
import { sessions } from './userRouter.js';
import OpenAI from 'openai';

export const topicFilterRouter = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// We can cache syllabus extraction globally since multiple users might use the same syllabus text string
const syllabusCache = new Map<string, any>();

topicFilterRouter.post('/filter-questions', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = auth.split(' ')[1];
    
    // Auth Validation & Limit Check
    const session = sessions.get(token);
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    if (session.filterLimit <= 0) {
      return res.status(403).json({ error: 'Filter limit reached. Please upgrade or wait.' });
    }

    const { syllabusText, questions } = req.body;
    if (!syllabusText || !questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Missing syllabusText or questions array' });
    }

    // 1. Extract Topics from Syllabus using OpenAI (or retrieve from cache)
    // We hash the first 1000 and last 1000 characters of syllabus to cache it roughly.
    const syllabusHash = Buffer.from(syllabusText.substring(0, 500) + syllabusText.slice(-500)).toString('base64');
    let topics = syllabusCache.get(syllabusHash);

    if (!topics) {
      const topicExtractionCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert curriculum analyzer. Given a Cambridge syllabus text, extract all main topics and their sub-units (e.g., '1.1 The purpose of accounting', '2.1 Asset evaluation'). Only return a JSON array of objects, where each object has 'unitId' (e.g. '1.1') and 'title' (e.g. 'The purpose of accounting'). DO NOT return anything but valid JSON."
          },
          {
            role: "user",
            content: "Syllabus text:\n" + syllabusText
          }
        ],
        response_format: { type: 'json_object' }
      });
      
      const content = topicExtractionCompletion.choices[0].message.content || '{"topics": []}';
      try {
        const parsed = JSON.parse(content);
        topics = parsed.topics || parsed;
        if (!Array.isArray(topics)) topics = Object.values(topics)[0];
        syllabusCache.set(syllabusHash, topics);
      } catch (e) {
        console.error("OpenAI JSON parsing error (topics):", e);
        return res.status(500).json({ error: 'Failed to extract topics from syllabus. Try again.' });
      }
    }

    // 2. Classify Questions
    const client = getTursoClient();
    const resultMapping: Record<string, string> = {};
    const unmappedQuestions: any[] = [];
    
    // Check DB for existing mappings
    if (client && questions.length > 0) {
      const qIds = questions.map((q: any) => q.id);
      const placeholders = qIds.map(() => '?').join(',');
      try {
        const rs = await client.execute({
          sql: `SELECT question_id, unit_id FROM question_topics WHERE question_id IN (${placeholders})`,
          args: qIds
        });
        rs.rows.forEach((r: any) => {
          resultMapping[r.question_id] = r.unit_id;
        });
      } catch (err: any) {
        console.error("Failed to query question_topics:", err);
      }
    }

    // Separate unmapped
    for (const q of questions) {
      if (!resultMapping[q.id]) {
        unmappedQuestions.push(q);
      }
    }

    // Only hit GPT and deduct limits if we actually have unmapped questions to process
    if (unmappedQuestions.length > 0) {
      // Clean up "....." lines and blank spaces to save tokens
      const qString = unmappedQuestions.map((q: any) => {
        let text = String(q.text || '').replace(/\.{4,}/g, ' ').replace(/_{4,}/g, ' ');
        return `ID ${q.id} [Q]: ${text.substring(0, 500)}`; // Truncate at 500 chars to be safe
      }).join('\n\n');
      
      const classificationCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an exam categorizer. You will be given a list of topics, and a list of questions with IDs. For each question, decide the most appropriate topic unitId. Return a JSON array of objects with 'id' (the question ID) and 'unitId' (the matched topic). DO NOT return anything but valid JSON."
          },
          {
            role: "user",
            content: `Topics:\n${JSON.stringify(topics, null, 2)}\n\nQuestions:\n${qString}`
          }
        ],
        response_format: { type: 'json_object' }
      });

      const cContent = classificationCompletion.choices[0].message.content || '{"classifications": []}';
      let classifications: any = [];
      try {
        const parsed = JSON.parse(cContent);
        classifications = parsed.classifications || parsed;
        if (!Array.isArray(classifications)) classifications = Object.values(classifications)[0];
      } catch (e) {
        console.error("OpenAI JSON parsing error (classification):", e);
        return res.status(500).json({ error: 'Failed to classify questions.' });
      }

      // Add new mappings to result and DB
      const insertStatements: Array<{ sql: string, args: any[] }> = [];
      for (const c of classifications) {
        if (!c.id || !c.unitId) continue;
        resultMapping[c.id] = c.unitId;
        insertStatements.push({
          sql: `INSERT OR IGNORE INTO question_topics (question_id, unit_id) VALUES (?, ?)`,
          args: [c.id, c.unitId]
        });
      }

      if (client && insertStatements.length > 0) {
        try {
          await client.batch(insertStatements);
        } catch (e) {
          console.error("Failed to insert mapping into question_topics DB:", e);
        }
      }

      // 3. Subtract 1 from filterLimit
      if (client) {
        await client.execute({
          sql: `UPDATE users SET filter_limit = filter_limit - 1 WHERE id = ?`,
          args: [session.userId]
        });
      }
      session.filterLimit -= 1;
    }

    res.json({ mappings: resultMapping, topics, newLimit: session.filterLimit });
  } catch (err: any) {
    console.error("Filter Error:", err);
    res.status(500).json({ error: err.message });
  }
});
