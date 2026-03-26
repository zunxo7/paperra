/** Shared with server — keep in sync with PapaCambridge filename rules. */
export const SESSION_CODES = ['M', 'S', 'W'] as const;
export type SessionCode = (typeof SESSION_CODES)[number];

export const VARIANT_CODES = [
  '01', '02', '03',
  '11', '12', '13',
  '21', '22', '23',
  '31', '32', '33',
  '41', '42', '43',
  '51', '52', '53',
  '61', '62', '63',
] as const;

export const MIN_YEAR = 2017;
export const MAX_YEAR = 2026;
