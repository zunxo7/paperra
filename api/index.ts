import { createApp } from "../server/createApp.ts";

/**
 * Vercel serverless entry — all `/api/*` requests are rewritten here (see `vercel.json`).
 * Do not import root `load-env.ts`: it is not in the function bundle; Vercel injects `process.env`.
 * Local dev uses `server.ts`, which loads dotenv first.
 */
export default createApp();
