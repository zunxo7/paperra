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
  const qClean = qual.toLowerCase() as QualificationLevel;
  if (!QUAL_SET.has(qClean)) {
    return res.status(400).json({ error: "Invalid qualificationLevel." });
  }

  const db = getTursoClient();
  if (!db) {
    return res.json({ ok: true, codes: null as string[] | null, catalogConfigured: false });
  }

  try {
    const r = await db.execute({
      sql: "SELECT syllabus_code FROM syllabus_data WHERE qualification_level = ? ORDER BY syllabus_code",
      args: [qual.toLowerCase()],
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
  const qClean = qual.toLowerCase() as QualificationLevel;
  if (!QUAL_SET.has(qClean)) {
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
    const r = await db.execute({
      sql: `SELECT variants_json FROM syllabus_data
            WHERE qualification_level = ? AND syllabus_code = ?`,
      args: [qual.toLowerCase(), code],
    });
    
    const variantSet = new Set<string>();
    if (r.rows.length > 0) {
      const vStr = r.rows[0].variants_json as string;
      if (vStr) {
        try {
          const fullData = JSON.parse(vStr) as Record<number, Record<string, string[]>>;
          for (let y = yearLo; y <= yearHi; y++) {
            const yearData = fullData[y];
            if (!yearData) continue;
            for (const sess of sessionsForQuery) {
              const variants = yearData[sess];
              if (Array.isArray(variants)) {
                variants.forEach(v => variantSet.add(v));
              }
            }
          }
        } catch(e) {}
      }
    }
    const variants = Array.from(variantSet).sort();
    return res.json({ hasCatalogData: true, variants });
  } catch (e) {
    console.error("[CATALOG_QP_VARIANTS]", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Query failed.",
    });
  }
});

router.get("/valid-papers", async (req, res) => {
  const qual = typeof req.query.qualificationLevel === "string" ? req.query.qualificationLevel.trim() : "";
  const code = typeof req.query.syllabusCode === "string" ? req.query.syllabusCode.trim() : "";
  if (!qual || !code) return res.status(400).json({ error: "Missing params" });
  
  const rawSessions = typeof req.query.sessions === "string" ? req.query.sessions.trim() : "";
  const rawVariants = typeof req.query.variants === "string" ? req.query.variants.trim() : "";
  
  const sessionList = rawSessions.split(",").filter((s) => SESSION_LETTERS.has(s.toUpperCase()));
  const variantList = rawVariants.split(",").filter(v => v);
  
  const y0 = parseYear(req.query.startYear, MIN_YEAR);
  const y1 = parseYear(req.query.endYear, MAX_YEAR);
  const yearLo = Math.min(y0, y1);
  const yearHi = Math.max(y0, y1);

  const qClean = qual.toLowerCase();
  const db = getTursoClient();
  if (!db) return res.json({ hasCatalogData: false, filenames: [] });

  try {
    const r = await db.execute({
      sql: `SELECT variants_json FROM syllabus_data
            WHERE qualification_level = ? AND syllabus_code = ?`,
      args: [qClean, code],
    });
    
    const filenames: string[] = [];
    const variantSet = new Set(variantList);
    
    if (r.rows.length > 0) {
       const vStr = r.rows[0].variants_json as string;
       if (vStr) {
         try {
           const fullData = JSON.parse(vStr) as Record<number, Record<string, string[]>>;
           for (let y = yearLo; y <= yearHi; y++) {
             const yearData = fullData[y];
             if (!yearData) continue;
             const yy = String(y).slice(-2);
             for (const sess of sessionList) {
               const sKey = sess.toUpperCase();
               const variants = yearData[sKey];
               if (Array.isArray(variants)) {
                 variants.forEach(va => {
                   if (variantSet.size === 0 || variantSet.has(va)) {
                     filenames.push(`${code}_${sKey.toLowerCase()}${yy}_qp_${va}.pdf`);
                   }
                 });
               }
             }
           }
         } catch(e) {}
       }
    }
    return res.json({ hasCatalogData: r.rows.length > 0, filenames });
  } catch (e) {
    console.error("[CATALOG_VALID_PAPERS]", e);
    return res.status(500).json({ error: "Error" });
  }
});

export default router;
