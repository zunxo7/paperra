/**
 * Unicode-aware helpers so PDF heuristics are not English/Latin-only.
 */

/** Count all Unicode letters (any script). */
export function countUnicodeLetters(s: string): number {
  return (s.match(/\p{L}/gu) || []).length;
}

/** True if the string has at least `min` letter characters (any script). */
export function hasUnicodeLetterRun(s: string, min: number): boolean {
  return countUnicodeLetters(s) >= min;
}

/**
 * Heuristic: page uses RTL layout (Arabic/Hebrew-heavy) so question numbers
 * may sit in the right margin instead of the left.
 */
export function isLikelyRtlLayout(s: string): boolean {
  const rtl = (s.match(/[\p{Script=Arabic}\p{Script=Hebrew}]/gu) || []).length;
  const latin = (s.match(/\p{Script=Latin}/gu) || []).length;
  if (rtl < 18) return false;
  return rtl >= Math.max(latin * 0.45, 24);
}

/** Meaningful “word” text on a line: letters in any script, not only [a-z]. */
export function rowHasMeaningfulWords(rowText: string, minLetters = 3): boolean {
  return hasUnicodeLetterRun(rowText.replace(/\d+/g, ''), minLetters);
}

/**
 * Cambridge-style “BLANK PAGE” sheets: barcodes/border may render as ink, but the
 * text layer is usually only “BLANK PAGE” (often twice) plus boilerplate.
 * Not for real questions that mention “the blank page” in an instruction.
 */
export function isExamBlankPageFromPdfText(fullText: string): boolean {
  const t = fullText.replace(/\s+/g, ' ').trim();
  const matches = t.match(/\bblank\s+page\b/gi) || [];
  if (matches.length === 0) return false;

  const stripped = t
    .replace(/\bblank\s+page\b/gi, ' ')
    .replace(/\bpage\s+\d+\s+of\s+\d+\b/gi, ' ')
    .replace(/©\s*UCLES[^\s]*/gi, ' ')
    .replace(/\*\s*\d{6,}\s*\*/g, ' ')
    .replace(/\bturn\s+over\b/gi, ' ')
    .replace(/\bdo\s+not\s+write\s+in\s+this\s+margin\b/gi, ' ')
    .replace(/\b\d{4}\s*\/\s*\d{2}\s*\/\s*[A-Z]\s*\/\s*[A-Z]\s*\/\s*\d{2}\b/gi, ' ')
    .replace(/\bcambridge\b/gi, ' ')
    .replace(/\binternational\b/gi, ' ')
    .replace(/\bigcse\b/gi, ' ')
    .replace(/\bo\s*level\b/gi, ' ')
    .replace(/\bas\s*(?:&|and)\s*a\s*level\b/gi, ' ')
    .replace(/\bassessment\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    /\b(use|using|write|complete|show|answer|draw|explain|calculate|describe|label|state|give|list|outline)\b/i.test(
      stripped
    )
  ) {
    return false;
  }

  const letters = countUnicodeLetters(stripped);
  if (matches.length >= 2) return letters < 60;
  return letters < 30 && t.length < 400;
}
