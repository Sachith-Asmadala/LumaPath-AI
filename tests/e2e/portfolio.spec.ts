import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const headers = { "content-type": "application/json" };
let project: Record<string, any> | null = null;

function facts() {
  return { technologies: ["Docker", "GitHub Actions"], languages: ["Python"], topics: ["containers"], has_readme: true, has_tests: true, has_documentation: false, has_ci: true, has_docker: true, has_iac: false, has_kubernetes: false, has_monitoring: false, last_activity_at: null };
}

function analysis(projectId: string) {
  return {
    id: "analysis-1", project_id: projectId, target_role: "DevOps Engineer", source_kind: "manual", source_timestamp: "2026-10-20T12:00:00Z", analyzed_at: "2026-10-20T12:01:00Z", completeness_score: 65,
    indicators: [{ key: "readme", label: "README", points: 20, max_points: 20, satisfied: true, evidence: "README is present." }, { key: "documentation", label: "Documentation", points: 0, max_points: 15, satisfied: false, evidence: "Documentation beyond README is not evidenced." }],
    demonstrated_skills: [{ skill_id: "docker", skill_name: "Docker", status: "self_reported", confidence: 0.65, evidence: ["Indicator present: docker"], source_type: "manual_project", source_timestamp: "2026-10-20T12:00:00Z" }],
    not_demonstrated_skills: [{ skill_id: "kubernetes", skill_name: "Kubernetes", status: "not_demonstrated", confidence: 0, evidence: ["No matching observable evidence in the current project facts."], source_type: "manual_project", source_timestamp: "2026-10-20T12:00:00Z" }],
    recommendations: [{ id: "rec-1", kind: "description", priority: "medium", title: "Use a factual portfolio description", rationale: "Uses only recorded project facts.", evidence_refs: ["project:facts"], editable_text: "Deployment Lab uses Docker and Python with a README and automated tests.", status: "proposed" }],
    factual_description: "Deployment Lab uses Docker and Python.", stale: false, disclaimer: "Not demonstrated means no matching project evidence; it is not a judgment about ability.",
  };
}

test.beforeEach(async ({ page }) => {
  project = null;
  await seedExistingStudent(page);
  await page.route("**/api/portfolio/projects**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/portfolio/projects" && request.method() === "GET") return route.fulfill({ status: 200, headers, body: JSON.stringify({ items: project ? [project] : [] }) });
    if (url.pathname === "/api/portfolio/projects" && request.method() === "POST") {
      const payload = request.postDataJSON();
      project = { id: "portfolio-1", owner_id: "student-onboarded", ...payload, created_at: "2026-10-20T12:00:00Z", updated_at: "2026-10-20T12:00:00Z", repositories: [], latest_analysis: null };
      return route.fulfill({ status: 201, headers, body: JSON.stringify(project) });
    }
    if (url.pathname.endsWith("/analysis") && request.method() === "POST") {
      const next = analysis("portfolio-1"); project = { ...project, latest_analysis: next };
      return route.fulfill({ status: 200, headers, body: JSON.stringify(next) });
    }
    if (url.pathname.includes("/recommendations/") && request.method() === "POST") {
      const payload = request.postDataJSON();
      const next = { ...analysis("portfolio-1").recommendations[0], status: payload.decision, editable_text: payload.edited_text };
      return route.fulfill({ status: 200, headers, body: JSON.stringify(next) });
    }
    return route.continue();
  });
});

test("manual project can be analysed and factual description reviewed before acceptance", async ({ page }) => {
  await page.goto("/portfolio");
  await page.getByRole("button", { name: "Add project" }).click();
  await page.getByLabel("Project title").fill("Deployment Lab");
  await page.getByLabel("What the project does").fill("A reproducible API packaging project that documents local setup, container usage and automated verification steps.");
  await page.getByLabel(/Technologies/).fill("Docker, GitHub Actions");
  await page.getByLabel(/Languages/).fill("Python");
  await page.getByText("README present").click();
  await page.getByText("Automated tests present").click();
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.getByText("Deployment Lab").first()).toBeVisible();
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(page.getByText("65")).toBeVisible();
  await expect(page.getByText("Docker")).toBeVisible();
  await expect(page.getByText("Kubernetes")).toBeVisible();
  const editable = page.getByLabel("Editable recommendation text");
  await editable.fill("Deployment Lab packages a Python API with Docker and includes automated tests.");
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Accepted")).toBeVisible();
});
