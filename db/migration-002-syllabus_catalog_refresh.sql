-- Run once on existing DBs (new installs already have this in turso-schema.sql)
CREATE TABLE IF NOT EXISTS syllabus_catalog_refresh (
  qualification_level TEXT NOT NULL
    CHECK (qualification_level IN ('igcse', 'olevel', 'alevel')),
  syllabus_code TEXT NOT NULL,
  last_refresh_at TEXT NOT NULL,
  PRIMARY KEY (qualification_level, syllabus_code)
);
