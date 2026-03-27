import { getTursoClient } from './server/db.js';

import fs from 'fs';
import dotenv from 'dotenv';
if (fs.existsSync('.env.local')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

async function run() {
  const client = getTursoClient();
  if (!client) {
    console.error('Turso DB not configured in .env.local');
    process.exit(1);
  }

  try {
    console.log('Creating question_topics table...');
    await client.execute(`
      CREATE TABLE IF NOT EXISTS question_topics (
        question_id TEXT PRIMARY KEY,
        unit_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Success! Table initialized.');
    process.exit(0);
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();
