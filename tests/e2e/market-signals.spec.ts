import { expect, test, type Page } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const headers = { "content-type": "application/json" };
const roles = [{ id: "devops-engineer", name: "DevOps Engineer", version: "2026-10-v2", level: "entry_to_junior", description: "Build and operate reliable delivery infrastructure.", quality_status: "approved", skill_count: 9 }];
const comparison = {
  role_id: "devops-engineer",
  international: { role_id: "devops-engineer", role_name: "DevOps Engineer", version: "2026-10-v2.f34-global-002", profile_scope: "international", region_code: null, skills: [{ skill_id: "docker", name: "Docker", required_proficiency: 75, estimated_minutes: 900, prerequisites: ["linux", "networking"] }] },
  regional: { role_id: "devops-engineer", role_name: "DevOps Engineer", version: "2026-10-v2.f34-r-lk-001", profile_scope: "regional", region_code: "lk", skills: [{ skill_id: "docker", name: "Docker", required_proficiency: 80, estimated_minutes: 900, prerequisites: ["linux", "networking"] }] },
  notes: ["Comparing a regional profile does not change your active career goal or roadmap.", "Existing completed or evidence-credited skills remain preserved unless you explicitly approve a later pathway recalculation."],
};
let update = {
  id: "impact-1", pathway_id: "path-1", target_role: "DevOps Engineer", from_version: "2026-10-v2", to_version: "2026-10-v2.f34-global-002", proposal_id: "proposal-1",
  explanation: "The approved DevOps Engineer taxonomy changed after review of emerging market evidence. Your current roadmap remains usable and unchanged until you choose to recalculate.",
  changes: [{ skill_id: "docker", skill_name: "Docker", change: "Changed Docker required proficiency from 70% to 75% after human review.", before_required_proficiency: 70, after_required_proficiency: 75, completed_credit_preserved: true }],
  status: "pending", created_at: "2026-11-20T10:00:00Z", decided_at: null, draft_pathway_id: null,
};
const signal = {
  id: "signal-1", role_id: "devops-engineer", skill_id: "docker", profile_scope: "international", region_code: null, label: "emerging", delta: .18, recent_share: .49, prior_share: .31, sample_size: 620, source_count: 3, confidence: .91, recency_days: 4, methodology_version: "doc-f34-signal-v1", methodology: "Weighted recent-vs-prior skill-share change. Signals never publish taxonomy changes automatically.", source_ids: ["jobs", "cert", "tech"], observation_ids: ["obs-1"], observations: [{ id: "obs-1", source_id: "jobs", source_name: "Governed aggregate", source_type: "job_aggregate", period_start: "2026-10-01", period_end: "2026-10-28", observed_at: "2026-11-16T10:00:00Z", sample_size: 220, skill_share: .49, provenance_url: "https://example.org/methodology" }], publication_eligible: true, limitations: [], created_at: "2026-11-20T10:00:00Z", expires_at: "2027-01-04T10:00:00Z",
};
let proposal = { id: "proposal-1", signal_id: "signal-1", base_version: "2026-10-v2", candidate_version: "2026-10-v2.f34-global-002", role_id: "devops-engineer", role_name: "DevOps Engineer", skill_id: "docker", skill_name: "Docker", profile_scope: "international", region_code: null, change_type: "increase_priority", current_required_proficiency: 70, proposed_required_proficiency: 75, impact_level: "low", status: "review", observed_signal: "emerging", signal_confidence: .91, rationale: "Governed aggregate evidence suggests a reviewed priority increase.", created_by: "curator-1", created_at: "2026-11-20T09:00:00Z", decided_at: null, decision_rationale: null, resulting_version: null };

async function mockShell(page: Page) {
  await page.route("**/api/notifications/**", route => route.fulfill({ status: 200, headers, body: JSON.stringify({ items: [], unread_count: 0, generated_at: "2026-11-20T10:00:00Z", partial: false, calendar_integration_available: true, student_id: "student-onboarded", timezone: "Asia/Colombo", quiet_hours_enabled: false, quiet_hours_start: "22:00", quiet_hours_end: "07:00", mute_non_critical: false, max_non_critical_per_day: 6, max_non_critical_per_hour: 3, in_app_enabled: true, push_enabled: false, push_permission_granted: false, email_enabled: false, email_consent: false, categories: {}, updated_at: "2026-11-20T10:00:00Z", push_provider_available: false, email_provider_available: false, saved: true }) }));
  await page.route("**/api/achievements**", route => route.fulfill({ status: 200, headers, body: JSON.stringify({ student_id: "student-onboarded", catalogue_version: "2026-10-v1", preferences: { student_id: "student-onboarded", feature_visible: true, celebrations_enabled: false, streak_visible: true, updated_at: "2026-11-20T10:00:00Z" }, awards: [], progress: [], streak: { current_count: 0, longest_count: 0, last_qualifying_date: null, grace_days_used: 0, state: "empty", rule_version: "2026-10-v1", explanation: "", qualifying_dates: [] }, new_awards: [], private_only: true, comparison_enabled: false, generated_at: "2026-11-20T10:00:00Z" }) }));
}

async function mockMarketApi(page: Page) {
  update = { ...update, status: "pending", decided_at: null, draft_pathway_id: null };
  proposal = { ...proposal, status: "review", decided_at: null, decision_rationale: null, resulting_version: null };
  await page.route("**/api/career-scenarios/roles", route => route.fulfill({ status: 200, headers, body: JSON.stringify(roles) }));
  await page.route("**/api/market-taxonomy/**", async route => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname;
    if (path.includes("/student/profile-comparison/")) return route.fulfill({ status: 200, headers, body: JSON.stringify(comparison) });
    if (path.endsWith("/student/updates") && req.method() === "GET") return route.fulfill({ status: 200, headers, body: JSON.stringify([update]) });
    if (path.includes("/student/updates/") && path.endsWith("/decision")) {
      const body = req.postDataJSON() as { decision: string };
      update = { ...update, status: body.decision === "recalculate" ? "recalculation_drafted" : "kept_current", decided_at: "2026-11-20T10:05:00Z", draft_pathway_id: body.decision === "recalculate" ? "draft-path-2" : null };
      return route.fulfill({ status: 200, headers, body: JSON.stringify(update) });
    }
    if (path.endsWith("/curator/governance")) return route.fulfill({ status: 200, headers, body: JSON.stringify({ methodology_version: "doc-f34-signal-v1", minimum_sample_size: 50, minimum_source_count: 2, publication_confidence: .62, emerging_delta_threshold: .08, declining_delta_threshold: -.08, source_rules: ["Approved governed sources only."], ai_rule: "AI cannot approve taxonomy changes." }) });
    if (path.endsWith("/curator/sources")) return route.fulfill({ status: 200, headers, body: JSON.stringify([{ id: "jobs", name: "Governed aggregate", source_type: "job_aggregate", canonical_url: "https://example.org", licensing_policy: "Aggregate metadata only.", trust_score: 92, status: "approved", bias_review_status: "approved", regions: ["international", "lk"], retention_days: 365, max_age_days: 120, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-20T00:00:00Z" }]) });
    if (path.endsWith("/curator/signals")) return route.fulfill({ status: 200, headers, body: JSON.stringify([signal]) });
    if (path.endsWith("/curator/proposals") && req.method() === "GET") return route.fulfill({ status: 200, headers, body: JSON.stringify([proposal]) });
    if (path.endsWith("/curator/versions")) return route.fulfill({ status: 200, headers, body: JSON.stringify([{ version: "2026-10-v2", status: "approved", profile_scope: "international", region_code: null, parent_version: null, methodology_version: "doc-f34-signal-v1", change_summary: "Baseline", created_by: "system", created_at: "2026-10-01T00:00:00Z", approved_by: "system", approved_at: "2026-10-01T00:00:00Z", retired_at: null, is_default: true }]) });
    if (path.endsWith("/decision") && path.includes("/curator/proposals/")) {
      const body = req.postDataJSON() as { decision: "approve" | "reject"; rationale: string };
      proposal = { ...proposal, status: body.decision === "approve" ? "approved" : "rejected", decided_at: "2026-11-20T10:10:00Z", decision_rationale: body.rationale, resulting_version: body.decision === "approve" ? "2026-10-v2.f34-global-002" : null };
      return route.fulfill({ status: 200, headers, body: JSON.stringify(proposal) });
    }
    return route.fulfill({ status: 404, headers, body: JSON.stringify({ detail: `Unhandled ${req.method()} ${path}` }) });
  });
}

test.beforeEach(async ({ page }) => { await seedExistingStudent(page); await mockShell(page); await mockMarketApi(page); });

test("student compares regional profile and creates only a recalculation draft after confirmation", async ({ page }) => {
  await page.goto("/market-signals");
  await expect(page.getByRole("heading", { name: "Market signals & pathway updates" })).toBeVisible();
  await expect(page.getByText("International profile")).toBeVisible();
  await expect(page.getByText("Regional profile · LK")).toBeVisible();
  await expect(page.getByText(/70% → 75%/)).toBeVisible();
  await page.getByRole("button", { name: "Review recalculation" }).click();
  await expect(page.getByText(/current active roadmap stays unchanged/i)).toBeVisible();
  await page.getByLabel(/I understand this creates a draft only/i).check();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("A reviewable roadmap draft was created. Your active roadmap is unchanged.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open recalculated draft" })).toBeVisible();
});

test("taxonomy reviewer sees provenance and must record a human rationale before publication", async ({ page }) => {
  await page.goto("/market-signals");
  await page.getByRole("tab", { name: "Curator review" }).click();
  await expect(page.getByText("Observed, not automatically published")).toBeVisible();
  await expect(page.getByText(/n=620/)).toBeVisible();
  await expect(page.getByText(/confidence 91%/)).toBeVisible();
  await expect(page.getByText(/governed aggregate/i)).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("heading", { name: "Approve taxonomy proposal" })).toBeVisible();
  await page.getByPlaceholder(/Document the evidence review/).fill("Reviewed source provenance, sample size, freshness, confidence, regional bias and methodology.");
  await page.getByRole("button", { name: "Approve" }).last().click();
  await expect(page.getByText("Proposal approved and a new immutable taxonomy version was published.")).toBeVisible();
});

test("market signals workspace remains narrow-screen safe", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/market-signals");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
});
