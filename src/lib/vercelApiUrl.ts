/**
 * On Vercel, POST to `/api/admin/...` can fall through to the SPA (405). Hitting `/api` with
 * `__pathname` reaches `api/index.js` reliably; `vercelPathMiddleware` restores the real path.
 */
export function vercelApiUrl(tailUnderApi: string): string {
  const t = tailUnderApi.replace(/^\/+/, "").replace(/^api\//, "");
  return `/api?__pathname=${encodeURIComponent(t)}`;
}
