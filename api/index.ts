import "../load-env.ts";
import { createApp } from "../server/createApp.ts";

/** Vercel serverless entry — all `/api/*` requests are rewritten here (see `vercel.json`). */
export default createApp();
