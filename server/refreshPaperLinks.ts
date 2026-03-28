import type { Client } from "@libsql/client";
import { Readable } from "node:stream";
import fetch, { type Response as NodeFetchResponse } from "node-fetch";
import { BASE_PAPERS_URL, SYLLABUS_BY_LEVEL, type QualificationLevel } from "../src/syllabusCatalog.ts";
import {
  MAX_YEAR,
  MIN_YEAR,
  SESSION_CODES,
  VARIANT_CODES,
} from "../src/lib/paperLinkConstants.ts";
import { finalUrlMatchesExpectedPastPaperPdf } from "./papaCambridgePdfResponse.ts";

function isTransientTursoError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|socket hang up|pipeline failed/i.test(msg);
}

async function batchWriteWithRetry(
  db: Client,
  batch: { sql: string; args: (string | number | null)[] }[],
  attempts = 4
): Promise<void> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await db.batch(batch, "write");
      return;
    } catch (e) {
      last = e;
      if (!isTransientTursoError(e) || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw last;
}

export type RefreshParams = {
  qualificationLevels: QualificationLevel[];
  /** If empty, all syllabi for the selected qualification levels. */
  syllabusCodes: string[];
};

export type RefreshStats = {
  urlsChecked: number;
  qpAvailable: number;
  msAvailable: number;
  qpMissing: number;
  msMissing: number;
  errors: number;
  durationMs: number;
};

function buildQpFilename(
  syllabusCode: string,
  session: string,
  yy: string,
  variant: string
): string {
  return `${syllabusCode}_${session.toLowerCase()}${yy}_qp_${variant}.pdf`;
}

function qpUrl(filename: string): string {
  return `${BASE_PAPERS_URL}${filename}`;
}

function msFilenameFromQp(filename: string): string {
  return filename.replace(/_qp_/i, "_ms_");
}

/** Match client / proxy-pdf: real PDFs start with `%PDF-` (avoid storing HTML error pages as available). */
function isLikelyPdfPrefix(b: Uint8Array): boolean {
  return (
    b.length >= 5 &&
    b[0] === 0x25 &&
    b[1] === 0x50 &&
    b[2] === 0x44 &&
    b[3] === 0x46 &&
    b[4] === 0x2d
  );
}

async function readFirstBytes(res: NodeFetchResponse, n: number): Promise<Uint8Array> {
  const body = res.body;
  if (!body) {
    const ab = await res.arrayBuffer();
    return new Uint8Array(ab).slice(0, n);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      body.removeListener("data", onData);
      body.removeListener("end", onEnd);
      body.removeListener("error", onError);
      const r = body as Readable;
      if (typeof r.destroy === "function") r.destroy();
      resolve();
    };
    const onData = (chunk: Buffer | string) => {
      const b = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      chunks.push(b);
      total += b.length;
      if (total >= n) finish();
    };
    const onEnd = () => finish();
    const onError = (e: Error) => {
      if (settled) return;
      settled = true;
      body.removeListener("data", onData);
      body.removeListener("end", onEnd);
      body.removeListener("error", onError);
      reject(e);
    };
    body.on("data", onData);
    body.once("end", onEnd);
    body.once("error", onError);
  });
  const merged = Buffer.concat(chunks);
  return new Uint8Array(merged.subarray(0, Math.min(n, merged.length)));
}

async function checkUrlExists(url: string): Promise<{
  ok: boolean;
  status: number;
  error: string | null;
}> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };
  const fetchOpts = (extra: { method: string; headers: Record<string, string> }) => ({
    method: extra.method,
    redirect: "follow" as const,
    headers: extra.headers,
    signal: AbortSignal.timeout(20000),
  });

  async function verifyPdf(
    res: NodeFetchResponse,
    requestUrl: string
  ): Promise<{ ok: boolean; status: number; error: string | null }> {
    const st = res.status;
    if (st !== 200 && st !== 206) {
      return { ok: false, status: st, error: `HTTP ${st}` };
    }
    const finalUrl = res.url || requestUrl;
    if (!finalUrlMatchesExpectedPastPaperPdf(requestUrl, finalUrl)) {
      return { ok: false, status: st, error: "redirected away from upload PDF (invalid link)" };
    }
    const prefix = await readFirstBytes(res, 8);
    if (isLikelyPdfPrefix(prefix)) {
      return { ok: true, status: st, error: null };
    }
    return { ok: false, status: st, error: "not a PDF" };
  }

  try {
    let getRes = await fetch(
      url,
      fetchOpts({
        method: "GET",
        headers: {
          ...headers,
          Range: "bytes=0-7",
        },
      })
    );
    if (getRes.status === 416) {
      getRes = await fetch(url, fetchOpts({ method: "GET", headers }));
    }
    return verifyPdf(getRes, url);
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "network error",
    };
  }
}

type RowUpsert = {
  qualification_level: string;
  syllabus_code: string;
  year: number;
  session_code: string;
  variant: string;
  paper_type: string;
  filename: string;
  url: string;
  is_available: number;
  http_status: number;
  last_error: string | null;
};

const UPSERT_CHECK = `
INSERT INTO paper_link_check (
  qualification_level, syllabus_code, year, session_code, variant, paper_type,
  filename, url, is_available, http_status, last_checked_at, last_error, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))
ON CONFLICT(qualification_level, syllabus_code, year, session_code, variant, paper_type)
DO UPDATE SET
  url = excluded.url,
  filename = excluded.filename,
  is_available = excluded.is_available,
  http_status = excluded.http_status,
  last_checked_at = datetime('now'),
  last_error = excluded.last_error,
  updated_at = datetime('now')
`;

const INSERT_EXPECTED = `
INSERT OR IGNORE INTO expected_paper_slot (
  qualification_level, syllabus_code, year, session_code, variant, expect_qp, expect_ms
) VALUES (?, ?, ?, ?, ?, 1, 1)
`;

const UPSERT_SYLLABUS_DATA = `
INSERT INTO syllabus_data (syllabus_code, qualification_level, variants_json, last_refresh_at)
VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
ON CONFLICT(syllabus_code) DO UPDATE SET 
  variants_json = excluded.variants_json,
  last_refresh_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
`;

export function estimateRefreshUrlCount(params: RefreshParams): number {
  const syllabi = resolveSyllabi(params);
  const years = MAX_YEAR - MIN_YEAR + 1;
  return syllabi.length * years * SESSION_CODES.length * VARIANT_CODES.length * 2;
}

function resolveSyllabi(params: RefreshParams): { code: string; level: QualificationLevel }[] {
  const out: { code: string; level: QualificationLevel }[] = [];
  const want = new Set(params.syllabusCodes.filter(Boolean));
  const filterAll = want.size === 0;

  for (const level of params.qualificationLevels) {
    const list = SYLLABUS_BY_LEVEL[level] ?? [];
    for (const item of list) {
      if (item.unavailable) continue;
      if (!filterAll && !want.has(item.code)) continue;
      out.push({ code: item.code, level });
    }
  }
  return out;
}

/** No longer using separate syllabus_catalog_refresh table; handled in syllabus_data */
function buildSyllabusRefreshStatements(): { sql: string; args: (string | number | null)[] }[] {
  return [];
}

export async function runLinkRefresh(
  db: Client,
  params: RefreshParams,
  onProgress?: (done: number, total: number) => void
): Promise<RefreshStats> {
  const t0 = Date.now();
  const syllabi = resolveSyllabi(params);

  if (syllabi.length === 0) {
    return {
      urlsChecked: 0,
      qpAvailable: 0,
      msAvailable: 0,
      qpMissing: 0,
      msMissing: 0,
      errors: 0,
      durationMs: Date.now() - t0,
    };
  }

  const y0 = MIN_YEAR;
  const y1 = MAX_YEAR;

  type Task = {
    row: RowUpsert;
    expectedArgs: [string, string, number, string, string];
  };
  const tasks: Task[] = [];

  for (const { code, level } of syllabi) {
    for (let year = y0; year <= y1; year += 1) {
      const yy = String(year).slice(-2);
      for (const session of SESSION_CODES) {
        for (const variant of VARIANT_CODES) {
          const qpFile = buildQpFilename(code, session, yy, variant);
          const msFile = msFilenameFromQp(qpFile);
          const qpU = qpUrl(qpFile);
          const msU = qpUrl(msFile);
          tasks.push({
            expectedArgs: [level, code, year, session, variant],
            row: {
              qualification_level: level,
              syllabus_code: code,
              year,
              session_code: session,
              variant,
              paper_type: "qp",
              filename: qpFile,
              url: qpU,
              is_available: 0,
              http_status: 0,
              last_error: null,
            },
          });
          tasks.push({
            expectedArgs: [level, code, year, session, variant],
            row: {
              qualification_level: level,
              syllabus_code: code,
              year,
              session_code: session,
              variant,
              paper_type: "ms",
              filename: msFile,
              url: msU,
              is_available: 0,
              http_status: 0,
              last_error: null,
            },
          });
        }
      }
    }
  }

  const total = tasks.length;
  let done = 0;
  let qpAvailable = 0;
  let msAvailable = 0;
  let qpMissing = 0;
  let msMissing = 0;
  let errors = 0;

  const CONCURRENCY = 1000;
  const syllabusRefreshStmts = buildSyllabusRefreshStatements();

  async function runOne(task: Task): Promise<void> {
    const { row } = task;
    const check = await checkUrlExists(row.url);
    row.is_available = check.ok ? 1 : 0;
    row.http_status = check.status;
    row.last_error = check.error;
  }

  // Map to store temporary state: SyllabusCode -> Year -> Session -> Set<Variant>
  const syllabusLinkMap = new Map<string, Record<number, Record<string, Set<string>>>>();

  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const slice = tasks.slice(i, i + CONCURRENCY);
    await Promise.all(slice.map((t) => runOne(t)));
    for (const t of slice) {
      const r = t.row;
      const ok = r.is_available === 1;
      if (ok && r.paper_type === "qp") {
        qpAvailable += 1;
        let sylObj = syllabusLinkMap.get(r.syllabus_code);
        if (!sylObj) {
          sylObj = {};
          syllabusLinkMap.set(r.syllabus_code, sylObj);
        }
        if (!sylObj[r.year]) sylObj[r.year] = {};
        if (!sylObj[r.year][r.session_code]) sylObj[r.year][r.session_code] = new Set();
        sylObj[r.year][r.session_code].add(r.variant);
      } else if (ok) {
        msAvailable += 1;
      } else {
        if (r.paper_type === "qp") qpMissing += 1;
        else msMissing += 1;
        if (r.http_status === 0) errors += 1;
      }
    }
    done += slice.length;
    onProgress?.(done, total);
  }

  const batch: { sql: string; args: (string | number | null)[] }[] = [];
  for (const [sCode, yearsObj] of syllabusLinkMap.entries()) {
    // Resolve level from the task list (any matching task will do)
    const level = tasks.find(t => t.row.syllabus_code === sCode)?.row.qualification_level || '';
    
    // Transform Set to Array for JSON
    const finalObj: Record<number, Record<string, string[]>> = {};
    for (const [yr, sessions] of Object.entries(yearsObj)) {
      finalObj[Number(yr)] = {};
      for (const [sess, vset] of Object.entries(sessions)) {
        finalObj[Number(yr)][sess] = Array.from(vset).sort();
      }
    }

    batch.push({
      sql: UPSERT_SYLLABUS_DATA,
      args: [sCode, level, JSON.stringify(finalObj)]
    });
  }

  for (const stmt of syllabusRefreshStmts) {
    batch.push(stmt);
  }
  
  if (batch.length > 0) {
    await batchWriteWithRetry(db, batch);
  }

  return {
    urlsChecked: total,
    qpAvailable,
    msAvailable,
    qpMissing,
    msMissing,
    errors,
    durationMs: Date.now() - t0,
  };
}
