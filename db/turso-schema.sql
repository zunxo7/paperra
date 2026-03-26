-- Paperra — shared Turso (libSQL) catalog
-- One DB for all site users: expected slots + verified PapaCambridge link checks.
-- Future: add accounts / sessions in separate tables; this catalog stays global.
--
-- Run once in Turso SQL shell or: turso db shell <db> < db/turso-schema.sql

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Canonical CAIE paper variant codes (align with app VARIANT_CANDIDATES)
-- ---------------------------------------------------------------------------
CREATE TABLE caie_variant (
  code TEXT PRIMARY KEY CHECK (length(code) = 2 AND code GLOB '[0-9][0-9]')
);

INSERT INTO caie_variant (code) VALUES
  ('01'),('02'),('03'),
  ('11'),('12'),('13'),
  ('21'),('22'),('23'),
  ('31'),('32'),('33'),
  ('41'),('42'),('43'),
  ('51'),('52'),('53'),
  ('61'),('62'),('63');

-- ---------------------------------------------------------------------------
-- Expected slots: what should exist (syllabus × year × session × variant)
-- ---------------------------------------------------------------------------
CREATE TABLE expected_paper_slot (
  qualification_level TEXT NOT NULL
    CHECK (qualification_level IN ('igcse', 'olevel', 'alevel')),
  syllabus_code TEXT NOT NULL,
  year INTEGER NOT NULL CHECK (year BETWEEN 1990 AND 2100),
  session_code TEXT NOT NULL CHECK (session_code IN ('M', 'S', 'W')),
  variant TEXT NOT NULL,
  expect_qp INTEGER NOT NULL DEFAULT 1 CHECK (expect_qp IN (0, 1)),
  expect_ms INTEGER NOT NULL DEFAULT 1 CHECK (expect_ms IN (0, 1)),
  note TEXT,
  PRIMARY KEY (qualification_level, syllabus_code, year, session_code, variant),
  FOREIGN KEY (variant) REFERENCES caie_variant(code)
);

CREATE INDEX idx_expected_syllabus_year ON expected_paper_slot (syllabus_code, year);

-- ---------------------------------------------------------------------------
-- Verified URLs (admin refresh upserts here)
-- ---------------------------------------------------------------------------
CREATE TABLE paper_link_check (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qualification_level TEXT NOT NULL
    CHECK (qualification_level IN ('igcse', 'olevel', 'alevel')),
  syllabus_code TEXT NOT NULL,
  year INTEGER NOT NULL CHECK (year BETWEEN 1990 AND 2100),
  session_code TEXT NOT NULL CHECK (session_code IN ('M', 'S', 'W')),
  variant TEXT NOT NULL,
  paper_type TEXT NOT NULL CHECK (paper_type IN ('qp', 'ms')),
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  is_available INTEGER NOT NULL DEFAULT 0 CHECK (is_available IN (0, 1)),
  http_status INTEGER,
  last_checked_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (qualification_level, syllabus_code, year, session_code, variant, paper_type),
  UNIQUE (url),
  FOREIGN KEY (variant) REFERENCES caie_variant(code)
);

CREATE INDEX idx_check_syllabus_year ON paper_link_check (syllabus_code, year);
CREATE INDEX idx_check_available ON paper_link_check (is_available, last_checked_at);

-- ---------------------------------------------------------------------------
-- Last admin refresh time per subject (qualification + syllabus code)
-- ---------------------------------------------------------------------------
CREATE TABLE syllabus_catalog_refresh (
  qualification_level TEXT NOT NULL
    CHECK (qualification_level IN ('igcse', 'olevel', 'alevel')),
  syllabus_code TEXT NOT NULL,
  last_refresh_at TEXT NOT NULL,
  PRIMARY KEY (qualification_level, syllabus_code)
);

-- ---------------------------------------------------------------------------
-- Rollups (expected vs checked)
-- ---------------------------------------------------------------------------
CREATE VIEW v_expected_counts AS
SELECT
  qualification_level,
  syllabus_code,
  year,
  SUM(expect_qp) AS expected_qp_slots,
  SUM(expect_ms) AS expected_ms_slots,
  SUM(expect_qp) + SUM(expect_ms) AS expected_total_link_rows
FROM expected_paper_slot
GROUP BY qualification_level, syllabus_code, year;

CREATE VIEW v_actual_counts AS
SELECT
  qualification_level,
  syllabus_code,
  year,
  SUM(CASE WHEN paper_type = 'qp' THEN 1 ELSE 0 END) AS rows_qp,
  SUM(CASE WHEN paper_type = 'ms' THEN 1 ELSE 0 END) AS rows_ms,
  SUM(CASE WHEN is_available = 1 AND paper_type = 'qp' THEN 1 ELSE 0 END) AS available_qp,
  SUM(CASE WHEN is_available = 1 AND paper_type = 'ms' THEN 1 ELSE 0 END) AS available_ms
FROM paper_link_check
GROUP BY qualification_level, syllabus_code, year;

CREATE VIEW v_count_reconciliation AS
SELECT
  e.qualification_level,
  e.syllabus_code,
  e.year,
  e.expected_qp_slots,
  e.expected_ms_slots,
  e.expected_total_link_rows,
  IFNULL(a.rows_qp, 0) AS checked_qp_rows,
  IFNULL(a.rows_ms, 0) AS checked_ms_rows,
  IFNULL(a.rows_qp, 0) + IFNULL(a.rows_ms, 0) AS checked_total_rows,
  e.expected_qp_slots - IFNULL(a.rows_qp, 0) AS missing_qp_checks,
  e.expected_ms_slots - IFNULL(a.rows_ms, 0) AS missing_ms_checks,
  IFNULL(a.available_qp, 0) AS available_qp,
  IFNULL(a.available_ms, 0) AS available_ms
FROM v_expected_counts e
LEFT JOIN v_actual_counts a
  ON a.qualification_level = e.qualification_level
 AND a.syllabus_code = e.syllabus_code
 AND a.year = e.year;
