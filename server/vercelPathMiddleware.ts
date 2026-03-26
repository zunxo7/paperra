import type { NextFunction, Request, Response } from "express";

/**
 * Vercel rewrite sends `/api/admin/login` → `/api/index?...` and drops the original path,
 * so Express sees `/` and no route matches (POST → 405, GET proxy → wrong handler / SPA HTML).
 * We pass the tail in `__pathname` via `vercel.json` and reconstruct `req.url` here.
 */
export function vercelRewritePathMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const raw = req.query.__pathname;
  if (typeof raw !== "string" || raw.includes("..")) {
    next();
    return;
  }
  const tail = raw.startsWith("/") ? raw.slice(1) : raw;
  const base = tail.length > 0 ? `/api/${tail}` : "/api";
  const url = req.url ?? "/";
  const qIdx = url.indexOf("?");
  const qs = qIdx >= 0 ? url.slice(qIdx + 1) : "";
  const sp = new URLSearchParams(qs);
  sp.delete("__pathname");
  const rest = sp.toString();
  req.url = base + (rest ? `?${rest}` : "");
  next();
}
