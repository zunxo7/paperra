/**
 * Parse Cambridge-style MCQ mark schemes: table rows Question | Answer (A–E) | Mark.
 * PDF text may be line-based or run together (e.g. "1 D 1 2 B 1").
 */

const ROW_THREE_COL = /^\s*(\d{1,3})\s+([A-Ea-e])\s+(\d{1,2})\s*$/;
const ROW_TWO_COL = /^\s*(\d{1,3})\s+([A-Ea-e])\s*$/;
/** Run-on text: "1 D 1 2 B 1 3 C 1" */
const FLOOD_TRIPLET = /(\d{1,3})\s+([A-Ea-e])\s+\d/gi;

const MIN_PAIRS = 5;

export function parseMcqMarkSchemeFromText(raw: string): Map<number, string> | null {
  const text = raw.replace(/\r/g, '\n');
  const map = new Map<number, string>();

  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let m = t.match(ROW_THREE_COL);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 200) map.set(n, m[2].toUpperCase());
      continue;
    }
    m = t.match(ROW_TWO_COL);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 200) map.set(n, m[2].toUpperCase());
    }
  }

  if (map.size < MIN_PAIRS) {
    map.clear();
    const oneLine = text.replace(/\s+/g, ' ');
    let match: RegExpExecArray | null;
    while ((match = FLOOD_TRIPLET.exec(oneLine)) !== null) {
      const n = Number(match[1]);
      if (n >= 1 && n <= 200) map.set(n, match[2].toUpperCase());
    }
  }

  if (map.size < MIN_PAIRS) return null;
  return map;
}

export function formatMcqAnswer(letter: string): string {
  return `Answer: ${letter}`;
}
