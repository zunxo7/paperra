import { createClient, type Client } from "@libsql/client";

let client: Client | null | undefined;

export function getTursoClient(): Client | null {
  if (client !== undefined) return client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    client = null;
    return null;
  }
  client = createClient({ url, authToken });
  return client;
}

export function resetTursoClientForTests(): void {
  client = undefined;
}
