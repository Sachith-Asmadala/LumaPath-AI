-- DOC-F33 Career Choice Scenario reference schema.
-- Runtime creates the same logical schema through CareerScenarioRepository.

CREATE TABLE simulation_scenarios (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  selected_role_ids_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('disposable','saved')),
  created_at TEXT NOT NULL,
  saved_at TEXT
);
CREATE INDEX idx_simulation_scenarios_owner
  ON simulation_scenarios(student_id, created_at DESC);

CREATE TABLE scenario_results (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL REFERENCES simulation_scenarios(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  taxonomy_version TEXT NOT NULL,
  pathway_version INTEGER,
  input_snapshot_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_scenario_results_owner
  ON scenario_results(student_id, scenario_id, created_at DESC);

-- Results are append-only: recomputation creates a new immutable result.
CREATE TRIGGER trg_scenario_results_immutable
BEFORE UPDATE ON scenario_results
BEGIN
  SELECT RAISE(ABORT, 'scenario_results are immutable');
END;

CREATE TABLE scenario_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_id TEXT NOT NULL REFERENCES simulation_scenarios(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL
);
CREATE INDEX idx_scenario_events_owner
  ON scenario_events(student_id, scenario_id, occurred_at DESC);
