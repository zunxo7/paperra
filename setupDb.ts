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
    console.log('Initializing optimized tables...');
    
    // Users table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        tokens INTEGER DEFAULT 15,
        subscription_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // New paper-centric storage
    await client.execute(`
      CREATE TABLE IF NOT EXISTS paper_questions_data (
        paper_id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL
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
