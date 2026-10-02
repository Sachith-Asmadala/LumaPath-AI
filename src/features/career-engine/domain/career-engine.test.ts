import { describe, expect, it } from "vitest";
import { createDemoState } from "@/data/demo/seed";
import { buildAssessmentPayload, type CareerRoleDetailView } from "@/features/career-engine/domain/career-engine";

const role: CareerRoleDetailView = {
  id: "devops-engineer",
  name: "DevOps Engineer",
  version: "2026-10-v2",
  level: "entry_to_junior",
  description: "DevOps role",
  quality_status: "approved",
  skill_count: 3,
  skills: [
    { skill_id: "linux", name: "Linux", required_proficiency: 70, prerequisites: [], estimated_minutes: 600, recommended_evidence: ["Linux evidence"] },
    { skill_id: "git", name: "Git", required_proficiency: 70, prerequisites: [], estimated_minutes: 480, recommended_evidence: ["Git evidence"] },
    { skill_id: "docker", name: "Docker", required_proficiency: 70, prerequisites: ["linux"], estimated_minutes: 1080, recommended_evidence: ["Container evidence"] },
  ],
};

describe("DOC-F29 career-engine client boundary", () => {
  it("submits only skills that belong to the selected approved role", () => {
    const state = createDemoState();
    const payload = buildAssessmentPayload(state, role);
    expect(payload.target_role).toBe("DevOps Engineer");
    expect(payload.self_assessments.every((item) => ["linux", "git", "docker"].includes(item.skill_id))).toBe(true);
    expect(payload.self_assessments.some((item) => item.skill_id === "kubernetes")).toBe(false);
  });

  it("labels browser-owned proficiency as low-confidence self assessment", () => {
    const payload = buildAssessmentPayload(createDemoState(), role);
    expect(payload.self_assessments.every((item) => item.confidence === 0.35)).toBe(true);
    expect(payload.include_portfolio_evidence).toBe(true);
    expect(payload.include_cv_evidence).toBe(true);
  });
});
