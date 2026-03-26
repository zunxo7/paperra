/**
 * Returns the API URL for a given path tail under `/api/`.
 * e.g. `apiUrl('admin/login')` → `/api/admin/login`
 */
export function apiUrl(tailUnderApi: string): string {
  const t = tailUnderApi.replace(/^\/+/, "").replace(/^api\//, "");
  return `/api/${t}`;
}
