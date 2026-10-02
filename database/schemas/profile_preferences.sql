-- DOC-F22: student locale preference and privacy-safe missing-translation reports.
CREATE TABLE profile_preferences (
  student_id TEXT PRIMARY KEY,
  locale TEXT NOT NULL CHECK(locale IN ('en','si-LK','ta-LK')),
  translation_version TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE translation_missing_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  message_key TEXT NOT NULL,
  translation_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(student_id, locale, message_key, translation_version)
);
