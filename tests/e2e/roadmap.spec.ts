import { expect, test, type Page } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const headers = { "content-type": "application/json" };

async function mockNotifications(page: Page) {
  await page.route("**/api/notifications/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/inbox")) return route.fulfill({ status: 200, headers, body: JSON.stringify({ items: [], unread_count: 0, generated_at: "2026-10-31T00:00:00Z", partial: false, calendar_integration_available: true }) });
    if (path.endsWith("/preferences")) return route.fulfill({ status: 200, headers, body: JSON.stringify({ student_id:"student-onboarded", timezone:"Asia/Colombo", quiet_hours_enabled:true, quiet_hours_start:"22:00", quiet_hours_end:"07:00", mute_non_critical:false, max_non_critical_per_day:6, max_non_critical_per_hour:3, in_app_enabled:true, push_enabled:false, push_permission_granted:false, email_enabled:false, email_consent:false, categories:{ deadline:true,risk:true,top_priority:true,missed_work:true,study_session:true,application_date:true,roadmap_milestone:true,calendar_event:true }, updated_at:"2026-10-31T00:00:00Z", push_provider_available:false, email_provider_available:false }) });
    if (path.endsWith("/candidates/sync")) return route.fulfill({ status: 200, headers, body: JSON.stringify({ accepted:0,deduplicated:0,resolved:0,expired:0,delivered:0,suppressed:0,failed:0 }) });
    return route.fulfill({ status: 200, headers, body: JSON.stringify({ saved: true }) });
  });
}

function roadmap(status: "draft" | "active", weeklyStatus: "draft" | "approved" = "draft") {
  return {
    id: "pathway-e2e", version: 1, status, target_role: "DevOps Engineer", goal: "Become internship-ready for DevOps", pace: "balanced",
    definition_version: "2026-10-v1", parent_pathway_id: null, recalculation_reason: [], weekly_learning_minutes: 360,
    daily_available_minutes: 240, timezone: "Asia/Colombo",
    steps: [{
      id: "step-linux", skill_id: "linux", name: "Linux", order: 1, prerequisites: [], state: "available", proficiency: 30,
      estimated_minutes: 600, target_evidence: ["Show a Linux troubleshooting artifact."], evidence_refs: [], transferable_credit: false,
      completion_source: null,
      selected_resource: { id:"linux-practice", title:"Linux evidence project", source:"LumaPath practice", source_url:null, cost_type:"free", price_usd:0, language:"English", format:"project", estimated_minutes:180, metadata_complete:true, ranking_reason:"Matches your preferences and exposes complete metadata." },
      alternative_resources: [{ id:"linux-ubuntu-cli", title:"Command line for beginners", source:"Ubuntu", source_url:"https://ubuntu.com/tutorials/command-line-for-beginners", cost_type:"free", price_usd:0, language:"English", format:"reading", estimated_minutes:120, metadata_complete:true, ranking_reason:"Free official source." }],
      resource_decision: "recommended", resource_reason: null,
    }],
    weekly_actions: [{ id:"plan-e2e", step_id:"step-linux", skill_id:"linux", title:"Linux · roadmap practice", week_start:"2026-11-02", start_at:"2026-11-05T12:30:00Z", end_at:"2026-11-05T13:30:00Z", planned_minutes:60, status:weeklyStatus, prerequisite_ready:true, rationale:"Fits declared capacity after protecting academic obligations.", source_label:"Roadmap · v1", internal_task_id: weeklyStatus === "approved" ? "roadmap-task-e2e" : null }],
    warnings: ["Urgent academic due dates and the preceding day were protected from automatic career-learning commitments."],
    change_summary: null, created_at:"2026-10-31T04:00:00Z", approved_at: status === "active" ? "2026-10-31T04:01:00Z" : null,
  };
}

async function mockPathways(page: Page) {
  let active: ReturnType<typeof roadmap> | null = null;
  let draft: ReturnType<typeof roadmap> | null = null;
  await page.route("**/api/pathways/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/pathways/current" && request.method() === "GET") {
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ active, pending_draft: draft }) });
    }
    if (path === "/api/pathways/generate" && request.method() === "POST") {
      draft = roadmap("draft");
      return route.fulfill({ status: 201, headers, body: JSON.stringify(draft) });
    }
    if (path.endsWith("/decision") && request.method() === "POST") {
      const body = request.postDataJSON();
      if (body.decision === "approve") { active = roadmap("active"); draft = null; return route.fulfill({ status: 200, headers, body: JSON.stringify(active) }); }
      draft = null;
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ ...roadmap("draft"), status: "rejected" }) });
    }
    if (path.endsWith("/weekly-actions/approve") && request.method() === "POST") {
      active = roadmap("active", "approved");
      return route.fulfill({ status: 200, headers, body: JSON.stringify({
        pathway_id:"pathway-e2e", approved_count:1,
        actions:[{ plan_item_id:"plan-e2e", internal_task_id:"roadmap-task-e2e", pathway_id:"pathway-e2e", pathway_version:1, step_id:"step-linux", skill_id:"linux", title:"Linux · roadmap practice", start_at:"2026-11-05T12:30:00Z", end_at:"2026-11-05T13:30:00Z", planned_minutes:60, source_label:"Roadmap · v1", description:"Approved weekly roadmap commitment." }],
      }) });
    }
    return route.fulfill({ status: 404, headers, body: JSON.stringify({ detail: `Unmocked pathway route ${path}` }) });
  });
}

test.beforeEach(async ({ page }) => {
  await seedExistingStudent(page);
  await mockNotifications(page);
  await mockPathways(page);
});

test("roadmap draft requires approval before a weekly action can enter Planner", async ({ page }) => {
  await page.goto("/roadmap");
  await expect(page.getByRole("heading", { name: /Turn your career pathway/i })).toBeVisible();
  await page.getByRole("button", { name: "Generate roadmap draft" }).click();
  await expect(page.getByRole("heading", { name: "Roadmap draft awaiting your approval" })).toBeVisible();
  await expect(page.getByText("This draft does not replace your active roadmap or change Planner until you approve it.")).toBeVisible();
  await expect(page.getByLabel("Select Linux · roadmap practice for Planner")).toBeDisabled();

  await page.getByRole("button", { name: "Approve roadmap" }).click();
  const weekly = page.getByLabel("Select Linux · roadmap practice for Planner");
  await expect(weekly).toBeEnabled();
  await weekly.check();
  await page.getByRole("button", { name: "Add selected (1)" }).click();
  await expect(page.getByText("Roadmap · v1", { exact: true })).toBeVisible();

  await page.goto("/planner");
  await expect(page.getByText("Linux · roadmap practice", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Roadmap · v1", { exact: true }).first()).toBeVisible();
});

test("roadmap controls are keyboard reachable and narrow-screen safe", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/roadmap");
  const role = page.getByLabel("Target role");
  await role.focus();
  await expect(role).toBeFocused();
  await page.getByLabel("Career learning goal").focus();
  await expect(page.getByLabel("Career learning goal")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
});
