type ParsedQuestion = {
  number: number;
  text: string;
  marks: number;
};

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function looksLikeQuestionStart(line: string): number | null {
  const m = line.match(/^(\d{1,2})(?:\s|[.)(:-])/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function parseQuestionsFromQuestionPaper(text: string): ParsedQuestion[] {
  const lines = normalizeLines(text);
  const starts: Array<{ idx: number; n: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const n = looksLikeQuestionStart(lines[i]);
    if (n !== null) starts.push({ idx: i, n });
  }

  const out: ParsedQuestion[] = [];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    const e = starts[i + 1]?.idx ?? lines.length;
    const chunkLines = lines.slice(s.idx, e);
    const chunk = chunkLines.join("\n").trim();
    if (chunk.length < 25) continue;

    const markMatch = chunk.match(/\[(\d{1,2})\]/);
    const marks = markMatch ? Number(markMatch[1]) : 1;
    out.push({
      number: s.n,
      text: chunk,
      marks: Number.isFinite(marks) ? marks : 1,
    });
  }

  const dedup = new Map<number, ParsedQuestion>();
  for (const q of out) {
    const prev = dedup.get(q.number);
    if (!prev || q.text.length > prev.text.length) dedup.set(q.number, q);
  }

  return [...dedup.values()].sort((a, b) => a.number - b.number);
}

export function parseMarkSchemeFromTextLocal(text: string): Record<string, string> {
  const lines = normalizeLines(text);
  const starts: Array<{ idx: number; n: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\d{1,2})(?:\([a-z]\))?(?:\s|[.):-])/i);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n)) starts.push({ idx: i, n });
  }

  const chunks: Record<string, string[]> = {};
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    const e = starts[i + 1]?.idx ?? lines.length;
    const chunk = lines.slice(s.idx, e).join("\n").trim();
    if (!chunk) continue;
    const key = String(s.n);
    if (!chunks[key]) chunks[key] = [];
    chunks[key].push(chunk);
  }

  const out: Record<string, string> = {};
  Object.entries(chunks).forEach(([k, arr]) => {
    out[k] = arr.join("\n\n");
  });
  return out;
}

export function inferMsUrlFromQpUrl(qpUrl: string): string | null {
  if (!qpUrl) return null;
  if (/_ms_/i.test(qpUrl)) return null;
  if (/_qp_/i.test(qpUrl)) return qpUrl.replace(/_qp_/i, "_ms_");
  return null;
}
