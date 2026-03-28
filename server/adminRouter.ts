import type { Client } from "@libsql/client";
import { Router } from "express";
import { createAdminSession, revokeAdminToken, validateAdminToken } from "./adminAuth.ts";
import { getTursoClient } from "./db.ts";
import OpenAI from "openai";
import {
  estimateRefreshUrlCount,
  runLinkRefresh,
  type RefreshParams,
} from "./refreshPaperLinks.ts";
import { VARIANT_CODES } from "../src/lib/paperLinkConstants.ts";
import type { QualificationLevel } from "../src/syllabusCatalog.ts";

const QUAL_SET = new Set<QualificationLevel>(["igcse", "olevel", "alevel"]);

/** Safe SQL identifier: user tables only. */
const SAFE_TABLE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Deletes every row from every non-internal table (see sqlite_master).
 * Re-seeds `caie_variant` so FK inserts from link refresh still work.
 */
async function deleteAllRowsFromAllTables(db: Client): Promise<void> {
  const listed = await db.execute({
    sql: `SELECT name FROM sqlite_master
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
            AND name NOT LIKE 'libsql%'
            AND name NOT IN ('users', 'user_sessions', 'syllabus_data', 'paper_questions_data', 'user_requests', 'user_history_blob')`,
    args: [],
  });
  const names: string[] = [];
  for (const row of listed.rows) {
    const n = Array.isArray(row)
      ? row[0]
      : (row as Record<string, unknown>).name;
    if (n == null || n === "") continue;
    const s = String(n);
    if (!SAFE_TABLE.test(s)) continue;
    names.push(s);
  }

  // Ensure 'users' and 'question_topics' are definitely included if they exist
  // though the above query should already find them.
  console.log(`[ADMIN_CLEAR] Found tables to clear: ${names.join(", ")}`);

  if (names.length === 0) return;

  await db.execute("PRAGMA foreign_keys = OFF");
  try {
    const batch = names.map((n) => ({ sql: `DELETE FROM "${n}"`, args: [] as [] }));
    
    // Also reset auto-increment sequences if the table exists
    try {
      await db.execute("DELETE FROM sqlite_sequence");
    } catch {
      // Ignored if sqlite_sequence doesn't exist yet
    }

    await db.batch(batch, "write");

    if (names.includes("caie_variant")) {
      const placeholders = VARIANT_CODES.map(() => "(?)").join(",");
      await db.execute({
        sql: `INSERT INTO caie_variant (code) VALUES ${placeholders}`,
        args: [...VARIANT_CODES],
      });
    }
  } finally {
    await db.execute("PRAGMA foreign_keys = ON");
  }
}

function parseAuth(req: { headers: { authorization?: string } }): string | undefined {
  const h = req.headers.authorization;
  if (!h) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1]?.trim();
}

async function checkAdmin(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const db = getTursoClient();
  if (!db) return false;
  try {
    const session = await db.execute({
      sql: `SELECT u.username FROM user_sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > DATETIME('now')`,
      args: [token]
    });
    return session.rows.length > 0 && (session.rows[0] as any).username === 'admin';
  } catch {
    return false;
  }
}

const router = Router();

router.get("/last-refreshes", async (req, res) => {
  const token = parseAuth(req);
  if (!(await checkAdmin(token))) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  const db = getTursoClient();
  if (!db) {
    return res
      .status(503)
      .json({ error: "Database not configured." });
  }
  try {
    const r = await db.execute({
      sql: "SELECT qualification_level, syllabus_code, last_refresh_at FROM syllabus_data WHERE last_refresh_at IS NOT NULL",
      args: [],
    });
    const rows = r.rows as unknown as Array<{
      qualification_level: string;
      syllabus_code: string;
      last_refresh_at: string;
    }>;
    return res.json({ ok: true, rows });
  } catch (e) {
    console.error("[ADMIN_LAST_REFRESHES]", e);
    return res.status(500).json({ error: "Query failed." });
  }
});

router.post("/estimate", async (req, res) => {
  const token = parseAuth(req);
  if (!(await checkAdmin(token))) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  const body = req.body ?? {};
  const levels = (Array.isArray(body.qualificationLevels) ? body.qualificationLevels : []) as string[];
  const validLevels = levels.filter((x): x is QualificationLevel => QUAL_SET.has(x as QualificationLevel));
  if (validLevels.length === 0) {
    return res.status(400).json({ error: "Select at least one qualification level." });
  }
  const syllabusCodes = Array.isArray(body.syllabusCodes) ? body.syllabusCodes.map(String) : [];
  const params: RefreshParams = { qualificationLevels: validLevels, syllabusCodes };
  try {
    const estimatedUrls = estimateRefreshUrlCount(params);
    return res.json({ ok: true, estimatedUrls, params });
  } catch (e) {
    console.error("[ADMIN_ESTIMATE]", e);
    return res.status(500).json({ error: "Estimate failed." });
  }
});

router.post("/clear-catalog", async (req, res) => {
  const token = parseAuth(req);
  if (!(await checkAdmin(token))) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  const db = getTursoClient();
  if (!db) {
    return res.status(503).json({ error: "Database not configured." });
  }
  try {
    await deleteAllRowsFromAllTables(db);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[ADMIN_CLEAR_CATALOG]", e);
    return res.status(500).json({ error: "Clear failed." });
  }
});

router.post("/refresh", async (req, res) => {
  const token = parseAuth(req);
  if (!(await checkAdmin(token))) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  const db = getTursoClient();
  if (!db) {
    return res.status(503).json({ error: "Database not configured." });
  }

  const body = req.body ?? {};
  const levels = (Array.isArray(body.qualificationLevels) ? body.qualificationLevels : []) as string[];
  const validLevels = levels.filter((x): x is QualificationLevel => QUAL_SET.has(x as QualificationLevel));
  if (validLevels.length === 0) {
    return res.status(400).json({ error: "Select at least one qualification level." });
  }
  const syllabusCodes = Array.isArray(body.syllabusCodes) ? body.syllabusCodes.map(String) : [];

  const params: RefreshParams = { qualificationLevels: validLevels, syllabusCodes };

  try {
    const stats = await runLinkRefresh(db, params);
    return res.json({ ok: true, stats, params });
  } catch (e) {
    console.error("[ADMIN_REFRESH]", e);
    return res.status(500).json({ error: "Refresh failed." });
  }
});

router.get("/requests", async (req, res) => {
  const token = parseAuth(req);
  if (!(await checkAdmin(token))) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  const db = getTursoClient();
  if (!db) return res.status(503).json({ error: "Database not configured." });
  try {
    const r = await db.execute({
      sql: `SELECT r.*, u.username as requester_name 
            FROM user_requests r 
            LEFT JOIN users u ON r.user_id = u.id 
            ORDER BY r.created_at DESC`,
      args: []
    });
    return res.json({ ok: true, requests: r.rows });
  } catch (e) {
    console.error("[ADMIN_REQUESTS]", e);
    return res.status(500).json({ error: "Query failed." });
  }
});

router.post("/requests/update-status", async (req, res) => {
  const token = parseAuth(req);
  if (!(await checkAdmin(token))) return res.status(401).json({ error: "Unauthorized." });
  const { id, status } = req.body;
  const db = getTursoClient();
  if (!db) return res.status(503).json({ error: "DB Error" });
  try {
    await db.execute({
      sql: `UPDATE user_requests SET status = ? WHERE id = ?`,
      args: [status, id]
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Update failed" });
  }
});

router.post("/clear-syllabus-topics", async (req, res) => {
  const token = parseAuth(req);
  if (!(await checkAdmin(token))) return res.status(401).json({ error: "Unauthorized." });
  const { syllabusCode } = req.body;
  const db = getTursoClient();
  if (!db) return res.status(503).json({ error: "DB Error" });
  try {
    if (syllabusCode) {
      await db.execute({ sql: `UPDATE syllabus_data SET topics_json = NULL WHERE syllabus_code = ?`, args: [syllabusCode] });
      // Also clear stale question mappings so they get re-classified with fresh topics
      await db.execute({ sql: `DELETE FROM paper_questions_data WHERE paper_id LIKE ?`, args: [syllabusCode.toLowerCase() + '%'] });
      res.json({ ok: true, message: `Cleared topics and question cache for ${syllabusCode}` });
    } else {
      await db.execute({ sql: `UPDATE syllabus_data SET topics_json = NULL`, args: [] });
      await db.execute({ sql: `DELETE FROM paper_questions_data`, args: [] });
      res.json({ ok: true, message: `Cleared topics and question cache for all syllabuses` });
    }
  } catch (e) {
    res.status(500).json({ error: "Clear failed" });
  }
});

router.post("/build-topics", async (req, res) => {
  const token = parseAuth(req);
  if (!(await checkAdmin(token))) return res.status(401).json({ error: "Unauthorized." });
  const { syllabusCode, syllabusText } = req.body;
  if (!syllabusCode || !syllabusText) return res.status(400).json({ error: "syllabusCode and syllabusText required." });
  const db = getTursoClient();
  if (!db) return res.status(503).json({ error: "DB Error" });
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-5-nano",
      messages: [
        {
          role: "system",
          content: "Extract Cambridge syllabus topics from the given text. Output JSON: {\"topics\": [{\"unitId\": \"3.1\", \"title\": \"...\", \"content\": \"keyword1, keyword2, ...\"}]}. Rules: (1) unitId must exactly match the printed section number — never invent numbers. (2) If a section has sub-units (e.g. '1.1', '1.2', '1.3'), include ONLY the sub-units, not the parent '1'. (3) If a section has NO sub-units (e.g. '7 Algorithm design', '9 Databases', '10 Boolean logic'), include it using its number as unitId (e.g. '7', '9', '10') — do NOT skip these. (4) content = dense comma-separated keywords, acronyms, named concepts from ALL learning objectives and notes — omit filler words, keep technical terms verbatim."
        },
        { role: "user", content: "Syllabus text:\n" + syllabusText }
      ],
      response_format: { type: "json_object" }
    });

    const raw = completion.choices[0].message.content || "{}";
    const parsed = JSON.parse(raw);
    let topics: any[] = parsed.topics || parsed;
    if (!Array.isArray(topics)) topics = (Object.values(parsed).find(v => Array.isArray(v)) as any[]) ?? [];

    // Filter fake deep sub-topics (e.g. 4.1.1)
    topics = topics.filter((t: any) => t.unitId && (t.unitId.match(/\./g) || []).length <= 1);

    // Renumber non-consecutive sub-units
    const subsByParent = new Map<string, any[]>();
    for (const t of topics) {
      if (t.unitId?.includes('.')) {
        const p = t.unitId.split('.')[0];
        if (!subsByParent.has(p)) subsByParent.set(p, []);
        subsByParent.get(p)!.push(t);
      }
    }
    for (const [, subs] of subsByParent.entries()) {
      const nums = subs.map(t => parseInt(t.unitId.split('.')[1])).sort((a, b) => a - b);
      if (nums[0] !== 1 || !nums.every((n, i) => i === 0 || n === nums[i - 1] + 1)) {
        subs.sort((a, b) => parseInt(a.unitId.split('.')[1]) - parseInt(b.unitId.split('.')[1]));
        subs.forEach((t, i) => { t.unitId = `${t.unitId.split('.')[0]}.${i + 1}`; });
      }
    }

    // Filter parent IDs that have sub-units
    const hasSubUnit = new Set<string>();
    for (const t of topics) {
      if (t.unitId?.includes('.')) hasSubUnit.add(t.unitId.split('.')[0]);
    }
    topics = topics.filter((t: any) => t.unitId && (t.unitId.includes('.') || !hasSubUnit.has(t.unitId)));

    // Clear stale question cache and save new topics
    await db.execute({ sql: `DELETE FROM paper_questions_data WHERE paper_id LIKE ?`, args: [syllabusCode.toLowerCase() + '%'] });
    await db.execute({ sql: `UPDATE syllabus_data SET topics_json = ? WHERE syllabus_code = ?`, args: [JSON.stringify(topics), syllabusCode] });

    return res.json({ ok: true, topicCount: topics.length, topics });
  } catch (e: any) {
    console.error("[ADMIN_BUILD_TOPICS]", e);
    return res.status(500).json({ error: e.message || "Build failed" });
  }
});

router.delete("/requests/:id", async (req, res) => {
  const token = parseAuth(req);
  if (!(await checkAdmin(token))) return res.status(401).json({ error: "Unauthorized." });
  const { id } = req.params;
  const db = getTursoClient();
  if (!db) return res.status(503).json({ error: "DB Error" });
  try {
    await db.execute({
      sql: `DELETE FROM user_requests WHERE id = ?`,
      args: [id]
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Delete failed" });
  }
});

export default router;
