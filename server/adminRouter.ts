import type { Client } from "@libsql/client";
import { Router } from "express";
import { createAdminSession, revokeAdminToken, validateAdminToken } from "./adminAuth.ts";
import { getTursoClient } from "./db.ts";
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
            AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
            AND name NOT LIKE 'libsql%'`,
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
  if (names.length === 0) return;

  await db.execute("PRAGMA foreign_keys = OFF");
  try {
    await db.batch(
      names.map((n) => ({ sql: `DELETE FROM "${n}"`, args: [] as [] })),
      "write"
    );
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

const router = Router();

router.post("/login", (req, res) => {
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(503).json({ error: "ADMIN_PASSWORD is not set on the server." });
  }
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid password." });
  }
  const token = createAdminSession();
  return res.json({ ok: true, token });
});

router.post("/logout", (req, res) => {
  const token = parseAuth(req);
  if (token) revokeAdminToken(token);
  return res.json({ ok: true });
});

router.get("/last-refreshes", async (req, res) => {
  const token = parseAuth(req);
  if (!validateAdminToken(token)) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  const db = getTursoClient();
  if (!db) {
    return res
      .status(503)
      .json({ error: "Database not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN." });
  }
  try {
    const r = await db.execute({
      sql: "SELECT qualification_level, syllabus_code, last_refresh_at FROM syllabus_catalog_refresh",
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
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Query failed.",
    });
  }
});

router.post("/estimate", async (req, res) => {
  const token = parseAuth(req);
  if (!validateAdminToken(token)) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  const body = req.body ?? {};
  const levels = (Array.isArray(body.qualificationLevels) ? body.qualificationLevels : []) as string[];
  const validLevels = levels.filter((x): x is QualificationLevel => QUAL_SET.has(x as QualificationLevel));
  if (validLevels.length === 0) {
    return res.status(400).json({ error: "Select at least one qualification level." });
  }
  const syllabusCodes = Array.isArray(body.syllabusCodes) ? body.syllabusCodes.map(String) : [];
  const params: RefreshParams = {
    qualificationLevels: validLevels,
    syllabusCodes,
  };
  try {
    const estimatedUrls = estimateRefreshUrlCount(params);
    return res.json({ ok: true, estimatedUrls, params });
  } catch (e) {
    console.error("[ADMIN_ESTIMATE]", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Estimate failed.",
    });
  }
});

/** Deletes every row in every application table (not sqlite_/libsql internal). Re-seeds `caie_variant`. */
router.post("/clear-catalog", async (req, res) => {
  const token = parseAuth(req);
  if (!validateAdminToken(token)) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  const db = getTursoClient();
  if (!db) {
    return res
      .status(503)
      .json({ error: "Database not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN." });
  }
  try {
    await deleteAllRowsFromAllTables(db);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[ADMIN_CLEAR_CATALOG]", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Clear failed.",
    });
  }
});

router.post("/refresh", async (req, res) => {
  const token = parseAuth(req);
  if (!validateAdminToken(token)) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  const db = getTursoClient();
  if (!db) {
    return res
      .status(503)
      .json({ error: "Database not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN." });
  }

  const body = req.body ?? {};
  const levels = (Array.isArray(body.qualificationLevels) ? body.qualificationLevels : []) as string[];
  const validLevels = levels.filter((x): x is QualificationLevel => QUAL_SET.has(x as QualificationLevel));
  if (validLevels.length === 0) {
    return res.status(400).json({ error: "Select at least one qualification level." });
  }
  const syllabusCodes = Array.isArray(body.syllabusCodes) ? body.syllabusCodes.map(String) : [];

  const params: RefreshParams = {
    qualificationLevels: validLevels,
    syllabusCodes,
  };

  try {
    const stats = await runLinkRefresh(db, params);
    return res.json({ ok: true, stats, params });
  } catch (e) {
    console.error("[ADMIN_REFRESH]", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Refresh failed.",
    });
  }
});

export default router;
