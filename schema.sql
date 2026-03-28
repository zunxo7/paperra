-- Paperra Optimized Database Schema (Reset Script)
-- WARNING: This script will DROP all existing tables before creating them.
-- Run this in Turso/LibSQL to initialize a fresh, optimized environment.

-- Drop existing tables (in order of dependency)
DROP TABLE IF EXISTS question_topics;
DROP TABLE IF EXISTS user_requests;
DROP TABLE IF EXISTS user_history_blob;
DROP TABLE IF EXISTS syllabus_data;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS registration_tracking;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  tokens INTEGER DEFAULT 15,
  subscription_json TEXT, -- Stores tier, expiry, and reset info
  created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- 2. Registration & Trial Tracking (Anti-Abuse)
CREATE TABLE IF NOT EXISTS registration_tracking (
  ip_address TEXT PRIMARY KEY,
  last_registration_at DATETIME, -- Null if they haven't registered an account yet
  guest_tokens INTEGER DEFAULT 3,
  last_activity_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- 2. User Sessions (Authentication)
CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Consolidated Syllabus Data (Architecture Optimization)
CREATE TABLE IF NOT EXISTS syllabus_data (
  syllabus_code TEXT PRIMARY KEY,
  qualification_level TEXT NOT NULL,
  variants_json TEXT, -- All available papers: { "2024": { "m": ["11", "12"], ... }, ... }
  topics_json TEXT,   -- Extracted syllabus topics/units
  last_refresh_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- 4. User History (Point-Read Optimization)
CREATE TABLE IF NOT EXISTS user_history_blob (
  user_id INTEGER PRIMARY KEY,
  history_json TEXT DEFAULT '[]', -- Array of recent paper accesses
  last_updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. User Requests (Feature/Bug/Subject)
CREATE TABLE IF NOT EXISTS user_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,        -- 'BUG_FIX', 'FEATURE', 'SUBJECT'
  description TEXT NOT NULL,
  metadata_json TEXT DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. Paper Questions Data (Paper-Centric Storage)
CREATE TABLE IF NOT EXISTS paper_questions_data (
  paper_id TEXT PRIMARY KEY, -- e.g. 0478_w25_qp_11.pdf (case-insensitive key)
  data_json TEXT NOT NULL    -- JSON mapping: { "qId": "unitId", ... }
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_syllabus_data_qual ON syllabus_data(qualification_level);
