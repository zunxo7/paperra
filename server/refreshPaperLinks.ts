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

const UPSERT_SYLLABUS_REFRESH = `
INSERT INTO syllabus_catalog_refresh (qualification_level, syllabus_code, last_refresh_at)
VALUES (?, ?, datetime('now'))
ON CONFLICT(qualification_level, syllabus_code) DO UPDATE SET last_refresh_at = datetime('now')
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

/** One statement per syllabus; deduped. Appended to each URL batch so `last_refresh_at` updates even if a later batch fails. */
function buildSyllabusRefreshStatements(
  syllabi: { code: string; level: QualificationLevel }[]
): { sql: string; args: (string | number | null)[] }[] {
  const seen = new Set<string>();
  const out: { sql: string; args: (string | number | null)[] }[] = [];
  for (const s of syllabi) {
    const k = `${s.level}:${s.code}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      sql: UPSERT_SYLLABUS_REFRESH,
      args: [s.level, s.code],
    });
  }
  return out;
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
  const syllabusRefreshStmts = buildSyllabusRefreshStatements(syllabi);

  async function runOne(task: Task): Promise<void> {
    const { row } = task;
    const check = await checkUrlExists(row.url);
    row.is_available = check.ok ? 1 : 0;
    row.http_status = check.status;
    row.last_error = check.error;
  }

  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const slice = tasks.slice(i, i + CONCURRENCY);
    await Promise.all(slice.map((t) => runOne(t)));
    for (const t of slice) {
      const r = t.row;
      const ok = r.is_available === 1;
      if (r.paper_type === "qp") {
        if (ok) qpAvailable += 1;
        else qpMissing += 1;
      } else {
        if (ok) msAvailable += 1;
        else msMissing += 1;
      }
      if (!ok && r.http_status === 0) errors += 1;
    }
    done += slice.length;
    onProgress?.(done, total);

    const batch: { sql: string; args: (string | number | null)[] }[] = [];
    for (const t of slice) {
      const [level, code, year, session, variant] = t.expectedArgs;
      batch.push({
        sql: INSERT_EXPECTED,
        args: [level, code, year, session, variant],
      });
      const r = t.row;
      batch.push({
        sql: UPSERT_CHECK,
        args: [
          r.qualification_level,
          r.syllabus_code,
          r.year,
          r.session_code,
          r.variant,
          r.paper_type,
          r.filename,
          r.url,
          r.is_available,
          r.http_status,
          r.last_error,
        ],
      });
    }
    for (const stmt of syllabusRefreshStmts) {
      batch.push(stmt);
    }
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
