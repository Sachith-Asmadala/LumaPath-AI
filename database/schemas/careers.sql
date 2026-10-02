-- DOC-F29 authoritative career taxonomy + student skill assessment.
-- SQLite reference schema. The runtime module creates the same structures idempotently.

CREATE TABLE career_roles (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  level TEXT NOT NULL,
  description TEXT NOT NULL,
  quality_status TEXT NOT NULL,
  published_at TEXT NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE TABLE skills (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (id, version)
);

CREATE TABLE role_skills (
  role_id TEXT NOT NULL,
  role_version TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  skill_version TEXT NOT NULL,
  required_proficiency INTEGER NOT NULL,
  estimated_minutes INTEGER NOT NULL,
  evidence_json TEXT NOT NULL,
  skill_order INTEGER NOT NULL,
  PRIMARY KEY (role_id, role_version, skill_id)
);

CREATE TABLE skill_dependencies (
  role_id TEXT NOT NULL,
  role_version TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  prerequisite_skill_id TEXT NOT NULL,
  PRIMARY KEY (role_id, role_version, skill_id, prerequisite_skill_id)
);

CREATE TABLE learning_resources (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT,
  resource_type TEXT NOT NULL,
  quality_score INTEGER NOT NULL,
  cost_type TEXT,
  price_usd REAL,
  language TEXT,
  format TEXT,
  estimated_minutes INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (id, version)
);

CREATE TABLE resource_skills (
  resource_id TEXT NOT NULL,
  resource_version TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  PRIMARY KEY (resource_id, resource_version, skill_id)
);

CREATE TABLE skill_assessments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  target_role TEXT NOT NULL,
  taxonomy_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  conflicting_skills_json TEXT NOT NULL DEFAULT '[]',
  disclaimer TEXT NOT NULL
);

CREATE TABLE student_skills (
  student_id TEXT NOT NULL,
  assessment_id TEXT NOT NULL REFERENCES skill_assessments(id) ON DELETE CASCADE,
  target_role TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  proficiency INTEGER NOT NULL,
  confidence REAL NOT NULL,
  required_proficiency INTEGER NOT NULL,
  gap INTEGER NOT NULL,
  meets_requirement INTEGER NOT NULL,
  uncertainty TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (assessment_id, skill_id)
);

CREATE TABLE student_skill_evidence (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES skill_assessments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  proficiency INTEGER NOT NULL,
  confidence REAL NOT NULL,
  source_ref TEXT NOT NULL,
  source_label TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

-- DOC-F13 already owns the versioned pathway/pathway_steps persistence.
-- DOC-F29 is the authoritative source for role/skill/resource definitions and
-- assessed student skill context consumed by that existing pathway engine.
