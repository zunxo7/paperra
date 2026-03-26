import { randomBytes } from "node:crypto";

const sessions = new Map<string, number>();

function prune(): void {
  const now = Date.now();
  for (const [token, exp] of sessions) {
    if (now > exp) sessions.delete(token);
  }
}

export function createAdminSession(): string {
  prune();
  const token = randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
  return token;
}

export function validateAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  prune();
  const exp = sessions.get(token);
  if (!exp || Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function revokeAdminToken(token: string): void {
  sessions.delete(token);
}
