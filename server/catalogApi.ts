import { Router } from "express";
import { getTursoClient } from "./db.ts";
import { MAX_YEAR, MIN_YEAR } from "../src/lib/paperLinkConstants.ts";
import type { QualificationLevel } from "../src/syllabusCatalog.ts";

const QUAL_SET = new Set<QualificationLevel>(["igcse", "olevel", "alevel"]);
const SESSION_LETTERS = new Set(["M", "S", "W"]);

const router = Router();

/**
 * Syllabus codes that have an admin link refresh recorded in `syllabus_catalog_refresh`.
 * Client lists only these in the user-facing subject picker.
 */
router.get("/refreshed-syllabi", async (req, res) => {
  const qual = typeof req.query.qualificationLevel === "string" ? req.query.qualificationLevel.trim() : "";
  if (!qual) {
    return res.status(400).json({ error: "qualificationLevel is required." });
  }
  if (!QUAL_SET.has(qual as QualificationLevel)) {
    return res.status(400).json({ error: "Invalid qualificationLevel." });
  }

  const db = getTursoClient();
  if (!db) {
    return res.json({ ok: true, codes: null as string[] | null, catalogConfigured: false });
  }

  try {
    const r = await db.execute({
      sql: "SELECT syllabus_code FROM syllabus_catalog_refresh WHERE qualification_level = ? ORDER BY syllabus_code",
      args: [qual],
    });
    const codes: string[] = [];
    for (const row of r.rows) {
      const c = Array.isArray(row) ? row[0] : (row as Record<string, unknown>).syllabus_code;
      if (c != null && c !== "") codes.push(String(c));
    }
    return res.json({ ok: true, codes, catalogConfigured: true });
  } catch (e) {
    console.error("[CATALOG_REFRESHED_SYLLABI]", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Query failed.",
    });
  }
});

function parseYear(q: unknown, fallback: number): number {
  const n = typeof q === "string" ? parseInt(q.trim(), 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * QP `variant` codes: **union** across requested sessions (M/S/W) — a variant appears if it
 * exists for any selected session. Across **years**, we still require the variant to appear in
 * **each** year in `startYear`…`endYear` (at least one selected session per year), so a
 * one-year-only variant does not show for a multi-year range.
 */
router.get("/qp-variants", async (req, res) => {
  const qual = typeof req.query.qualificationLevel === "string" ? req.query.qualificationLevel.trim() : "";
  const code = typeof req.query.syllabusCode === "string" ? req.query.syllabusCode.trim() : "";
  if (!qual || !code) {
    return res.status(400).json({ error: "qualificationLevel and syllabusCode are required." });
  }
  if (!QUAL_SET.has(qual as QualificationLevel)) {
    return res.status(400).json({ error: "Invalid qualificationLevel." });
  }

  const rawSessions = typeof req.query.sessions === "string" ? req.query.sessions.trim() : "";
  const sessionList = rawSessions
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SESSION_LETTERS.has(s));
  const sessionsForQuery = sessionList.length > 0 ? sessionList : ["M", "S", "W"];

  const y0 = parseYear(req.query.startYear, MIN_YEAR);
  const y1 = parseYear(req.query.endYear, MAX_YEAR);
  const yearLo = Math.max(MIN_YEAR, Math.min(y0, y1));
  const yearHi = Math.min(MAX_YEAR, Math.max(y0, y1));

  const db = getTursoClient();
  if (!db) {
    return res.json({ hasCatalogData: false, variants: null as string[] | null });
  }

  try {
    const chk = await db.execute({
      sql: "SELECT 1 AS ok FROM paper_link_check WHERE qualification_level = ? AND syllabus_code = ? LIMIT 1",
      args: [qual, code],
    });
    const hasAnyRow = (chk.rows?.length ?? 0) > 0;
    if (!hasAnyRow) {
      return res.json({ hasCatalogData: false, variants: null });
    }

    const inPlaceholders = sessionsForQuery.map(() => "?").join(", ");
    const yearSpan = yearHi - yearLo + 1;
    /** Union across sessions; still require every calendar year in range to have ≥1 matching row. */
    const r = await db.execute({
      sql: `SELECT variant FROM paper_link_check
            WHERE qualification_level = ? AND syllabus_code = ? AND paper_type = 'qp' AND is_available = 1
            AND session_code IN (${inPlaceholders})
            AND year BETWEEN ? AND ?
            GROUP BY variant
            HAVING COUNT(DISTINCT year) = ?
            ORDER BY variant`,
      args: [qual, code, ...sessionsForQuery, yearLo, yearHi, yearSpan],
    });
    const rows = r.rows;
    const variants: string[] = [];
    for (const row of rows) {
      const v = Array.isArray(row) ? row[0] : (row as Record<string, unknown>).variant;
      if (v != null && v !== "") variants.push(String(v));
    }
    return res.json({ hasCatalogData: true, variants });
  } catch (e) {
    console.error("[CATALOG_QP_VARIANTS]", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Query failed.",
    });
  }
});

export default router;
