import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const headers = { "content-type": "application/json" };
let cv: Record<string, any> | null = null;

const sections = [
  { key: "contact", title: "Contact", content: "Student Name\nstudent@example.com" },
  { key: "education", title: "Education", content: "BSc Computer Science" },
  { key: "experience", title: "Experience", content: "Built internal prototypes and documented technical workflows." },
  { key: "projects", title: "Projects", content: "Deployment Lab — Docker and GitHub Actions project." },
  { key: "skills", title: "Skills", content: "Python, Git, Docker" },
];

function report() {
  return {
    id: "analysis-1", document_id: "cv-1", analysis_version: "2026-10-v1", target_role: "DevOps Engineer", analyzed_at: "2026-10-20T12:00:00Z", word_count: 260,
    findings: [{ id: "f1", category: "skills", severity: "low", title: "Some target-role skills are not demonstrated in the CV", rationale: "One target-role skill has no matching CV evidence. This does not mean the student lacks it.", source_section: "skills", proposed_action: "Add it only when a project or other source can verify it." }],
    role_skills: [{ skill_id: "docker", skill_name: "Docker", status: "cv_evidenced", evidence: ["CV text includes: docker"] }, { skill_id: "terraform", skill_name: "Terraform", status: "not_demonstrated_in_cv", evidence: ["No matching evidence is visible in the reviewed CV."] }],
    suggestions: [{ id: "s1", kind: "wording", section_key: "summary", title: "Draft a role-focused summary", rationale: "Uses only current evidence.", evidence_refs: ["skill:docker:cv_evidenced"], draft_text: "Student targeting DevOps Engineer opportunities with evidence in Docker.", status: "proposed" }],
    ats_disclaimer: "This is a deterministic ATS-oriented review. It does not guarantee ATS success.", evidence_disclaimer: "Suggestions are drafts. Verify every factual claim.",
  };
}

test.beforeEach(async ({ page }) => {
  cv = null;
  await seedExistingStudent(page);
  await page.route("**/api/cv/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/cv/documents" && request.method() === "GET") return route.fulfill({ status: 200, headers, body: JSON.stringify({ items: cv ? [cv] : [] }) });
    if (url.pathname === "/api/cv/documents/paste" && request.method() === "POST") {
      const payload = request.postDataJSON();
      cv = { id: "cv-1", owner_id: "student-onboarded", source_type: "paste", title: payload.title, original_filename: null, canonical_mime: "text/plain", target_role: payload.target_role, retention_days: payload.retention_days, expires_at: "2026-11-19T12:00:00Z", created_at: "2026-10-20T12:00:00Z", updated_at: "2026-10-20T12:00:00Z", parse_status: "parsed", parse_error: null, source_deleted_at: null, sections_confirmed: false, sections, latest_analysis: null };
      return route.fulfill({ status: 201, headers, body: JSON.stringify(cv) });
    }
    if (url.pathname.endsWith("/sections") && request.method() === "PUT") {
      const payload = request.postDataJSON(); cv = { ...cv, sections: payload.sections, sections_confirmed: true, updated_at: "2026-10-20T12:01:00Z" };
      return route.fulfill({ status: 200, headers, body: JSON.stringify(cv) });
    }
    if (url.pathname.endsWith("/analysis") && request.method() === "POST") {
      const analysis = report(); cv = { ...cv, latest_analysis: analysis };
      return route.fulfill({ status: 200, headers, body: JSON.stringify(analysis) });
    }
    if (url.pathname.includes("/suggestions/") && request.method() === "POST") {
      const payload = request.postDataJSON(); const next = { ...report().suggestions[0], status: payload.decision, draft_text: payload.edited_text };
      if (cv?.latest_analysis) cv = { ...cv, latest_analysis: { ...cv.latest_analysis, suggestions: [next] } };
      return route.fulfill({ status: 200, headers, body: JSON.stringify(next) });
    }
    if (url.pathname.endsWith("/export") && request.method() === "GET") return route.fulfill({ status: 200, headers, body: JSON.stringify({ filename: "cv-reviewed.txt", media_type: "text/plain", content: "ACCEPTED IMPROVEMENT DRAFTS\nDevOps-focused summary", accepted_suggestion_count: 1 }) });
    return route.continue();
  });
});

test("paste, review, analyze and approve a CV draft without automatic claims", async ({ page }) => {
  await page.goto("/cv");
  await page.getByRole("button", { name: "Paste" }).click();
  await page.getByLabel("CV text").fill("Student Name\nstudent@example.com\nEDUCATION\nBSc Computer Science\nSKILLS\nPython, Git, Docker\nPROJECTS\nDeployment Lab");
  await page.getByRole("button", { name: "Save and parse" }).click();
  await expect(page.getByText("Review parsed CV sections")).toBeVisible();
  await page.getByRole("button", { name: "Confirm sections" }).click();
  await page.getByRole("button", { name: "Run CV analysis" }).click();
  await expect(page.getByText("Docker")).toBeVisible();
  await expect(page.getByText("Terraform")).toBeVisible();
  const draft = page.getByLabel("Editable draft / question");
  await draft.fill("DevOps-focused Computer Science student with project evidence in Docker.");
  await page.getByRole("button", { name: "Approve draft" }).click();
  await expect(page.getByText("Accepted")).toBeVisible();
});

test("CV page keeps primary controls keyboard reachable", async ({ page }) => {
  await page.goto("/cv");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"]).toContain(focused);
  await page.setViewportSize({ width: 360, height: 800 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});
