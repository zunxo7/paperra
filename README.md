# Paperra

Web app for **Cambridge O Level, IGCSE, and A / AS** past papers: build PapaCambridge-style QP URLs, fetch PDFs, and extract questions (and mark schemes where available).

## Stack

- **Frontend:** React (Vite), Tailwind  
- **Backend:** Express (`npm run dev` runs `server.ts`)  
- **Optional:** [Turso](https://turso.tech/) (LibSQL) for a shared syllabus / QP-variant catalog and admin refresh jobs

## Setup

1. **Node.js 20+**
2. `npm install`
3. Copy `.env.example` → `.env` or `.env.local` and set:
   - `OPENAI_API_KEY` — if you use the AI features in-app  
   - `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` — optional; without them the app falls back to static syllabus lists  
   - `ADMIN_PASSWORD` — optional; enables the admin panel (triple-click the book icon in the header)

4. `npm run dev` — dev server (see `server.ts` / `vite.config` for port).

## Scripts

| Command        | Description        |
|----------------|--------------------|
| `npm run dev`  | Dev server         |
| `npm run build`| Production build   |
| `npm run lint` | Typecheck (`tsc`)  |
