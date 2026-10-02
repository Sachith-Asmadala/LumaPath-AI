export type CvSectionKey = "contact" | "summary" | "education" | "experience" | "projects" | "skills" | "certifications" | "other";
export type CvSuggestionStatus = "proposed" | "accepted" | "dismissed";

export interface CvSection { key: CvSectionKey; title: string; content: string; }
export interface CvFinding {
  id: string; category: "structure" | "readability" | "skills" | "projects" | "experience" | "ats" | "privacy";
  severity: "high" | "medium" | "low"; title: string; rationale: string; source_section: CvSectionKey | null; proposed_action: string;
}
export interface CvRoleSkill {
  skill_id: string; skill_name: string; status: "cv_evidenced" | "portfolio_evidenced" | "not_demonstrated_in_cv"; evidence: string[];
}
export interface CvSuggestion {
  id: string; kind: "wording" | "evidence_request"; section_key: CvSectionKey; title: string; rationale: string;
  evidence_refs: string[]; draft_text: string; status: CvSuggestionStatus;
}
export interface CvAnalysis {
  id: string; document_id: string; analysis_version: string; target_role: string; analyzed_at: string; word_count: number;
  findings: CvFinding[]; role_skills: CvRoleSkill[]; suggestions: CvSuggestion[]; ats_disclaimer: string; evidence_disclaimer: string;
}
export interface CvDocument {
  id: string; owner_id: string; source_type: "upload" | "paste"; title: string; original_filename: string | null; canonical_mime: string | null;
  target_role: string; retention_days: 7 | 30 | 90; expires_at: string; created_at: string; updated_at: string;
  parse_status: "parsed" | "parse_failed" | "source_deleted"; parse_error: string | null; source_deleted_at: string | null;
  sections_confirmed: boolean; sections: CvSection[]; latest_analysis: CvAnalysis | null;
}
export interface CvExport { filename: string; media_type: "text/plain"; content: string; accepted_suggestion_count: number; }

export function isCvDocument(value: unknown): value is CvDocument {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CvDocument>;
  return typeof item.id === "string" && typeof item.title === "string" && Array.isArray(item.sections) && typeof item.sections_confirmed === "boolean";
}
