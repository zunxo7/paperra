/**
 * PapaCambridge often redirects missing paper URLs to the main site (e.g. papacambridge.com/)
 * with HTTP 200 + HTML. We must not treat that as a valid PDF — check the final URL after
 * redirects, not only status or Content-Type.
 */

function pathBasename(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * Returns true only if the response landed on the same past-paper upload path + filename as
 * the request (invalid links typically redirect away from `/upload/*.pdf`).
 */
export function finalUrlMatchesExpectedPastPaperPdf(requestUrl: string, responseUrl: string): boolean {
  try {
    const req = new URL(requestUrl);
    const res = new URL(responseUrl);
    const want = pathBasename(req.pathname).toLowerCase();
    const got = pathBasename(res.pathname).toLowerCase();
    if (!want.endsWith(".pdf") || want.length < 5) return false;
    if (want !== got) return false;
    if (!req.pathname.includes("/upload/") || !res.pathname.includes("/upload/")) return false;
    const host = res.hostname.toLowerCase();
    if (!host.includes("papacambridge")) return false;
    return true;
  } catch {
    return false;
  }
}
