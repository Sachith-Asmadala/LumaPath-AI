import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const headers = { "content-type": "application/json" };
let application: (Record<string, unknown> & { history?: unknown[] }) | null = null;

function response(overrides: Record<string, unknown> = {}) {
  return {
    id: "application-1", company: "Acme Cloud", role: "DevOps Intern", source_type: "manual", source_reference: null, source_url: "https://example.com/role",
    application_deadline: "2026-10-28", application_deadline_confirmed: true, deadline_state: "upcoming", contact_name: "Recruiting", contact_email: "careers@example.com",
    interview_at: null, interview_at_confirmed: false, follow_up_at: null, follow_up_at_confirmed: false, notes: "Private note", next_action: "Review Docker evidence", timezone: "Asia/Colombo",
    status: "interested", archived: false, outcome_notes: "", requirements: [{ id: "req-1", skill_name: "Docker", detail: "", required: true, evidence_status: "demonstrated", evidence_refs: ["Docker project evidence"] }],
    readiness_actions: [{ skill_name: "Docker", status: "evidence_available", title: "Prepare Docker evidence", rationale: "This requirement has project evidence.", evidence_refs: ["Docker project evidence"], href: "/portfolio" }],
    reminders: [], history: [{ id: 1, event_type: "created", from_status: null, to_status: "interested", note: "manual", occurred_at: "2026-10-20T10:00:00Z" }], created_at: "2026-10-20T10:00:00Z", updated_at: "2026-10-20T10:00:00Z", ...overrides,
  };
}

test.beforeEach(async ({ page }) => {
  application = null;
  await seedExistingStudent(page);
  await page.route("**/api/internships/applications**", async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (url.pathname === "/api/internships/applications" && request.method() === "GET") return route.fulfill({ status: 200, headers, body: JSON.stringify({ items: application ? [application] : [] }) });
    if (url.pathname === "/api/internships/applications" && request.method() === "POST") { application = response(); return route.fulfill({ status: 201, headers, body: JSON.stringify(application) }); }
    if (url.pathname.endsWith("/status") && request.method() === "POST") { const payload = request.postDataJSON(); application = response({ ...application, status: payload.status, history: [...(application?.history ?? []), { id: 2, event_type: "status_changed", from_status: "interested", to_status: payload.status, note: payload.note, occurred_at: "2026-10-20T10:05:00Z" }] }); return route.fulfill({ status: 200, headers, body: JSON.stringify(application) }); }
    if (url.pathname.endsWith("/reminders") && request.method() === "POST") { const payload = request.postDataJSON(); const item = { id: "rem-1", kind: payload.kind, title: payload.title, remind_at: payload.remind_at, timezone: payload.timezone, enabled: true, notifications_enabled: payload.notifications_enabled, quiet_hours_start: payload.quiet_hours_start, quiet_hours_end: payload.quiet_hours_end, effective_notification_at: payload.remind_at, created_at: "2026-10-20T10:00:00Z", updated_at: "2026-10-20T10:00:00Z" }; application = response({ ...application, reminders: [item] }); return route.fulfill({ status: 201, headers, body: JSON.stringify(item) }); }
    if (url.pathname.endsWith("/planner-actions") && request.method() === "POST") { const payload = request.postDataJSON(); return route.fulfill({ status: 201, headers, body: JSON.stringify({ id: "pa-1", application_id: "application-1", kind: payload.kind, title: payload.title, start_at: payload.start_at, duration_minutes: payload.duration_minutes, category: "Internship", description: "Confirmed internship preparation task.", idempotent_replay: false }) }); }
    if (url.pathname.endsWith("/application-1") && request.method() === "PUT") { return route.fulfill({ status: 200, headers, body: JSON.stringify(application) }); }
    return route.continue();
  });
});

test("student can create, progress and schedule an internship application", async ({ page }) => {
  await page.goto("/internships");
  await page.getByRole("button", { name: "Add opportunity" }).click();
  await page.getByLabel("Company").fill("Acme Cloud");
  await page.getByLabel("Role").fill("DevOps Intern");
  await page.getByLabel("Application deadline").fill("2026-10-28");
  await page.getByText("I confirmed this date").click();
  await page.getByLabel("Required skills").fill("Docker");
  await page.getByRole("button", { name: "Create application" }).click();
  await expect(page.getByText("DevOps Intern")).toBeVisible();
  await page.getByRole("button", { name: /Preparing/ }).click();
  await expect(page.getByText("Preparing")).toBeVisible();

  await page.getByLabel("Reminder title").fill("Application deadline check");
  await page.getByLabel("Remind at").fill("2026-10-27T18:00");
  await page.getByRole("button", { name: "Add reminder" }).click();
  await expect(page.getByText("Application deadline check")).toBeVisible();

  await page.getByLabel("Planner task title").fill("Finish application review");
  await page.getByLabel("Start date and time").fill("2026-10-27T17:00");
  await page.getByText("I reviewed and confirm this planner timing.").click();
  await page.getByRole("button", { name: "Add confirmed task to Planner" }).click();
});

test("application tracker remains keyboard reachable and narrow-screen safe", async ({ page }) => {
  application = response();
  await page.goto("/internships");
  await page.keyboard.press("Tab");
  expect(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"]).toContain(await page.evaluate(() => document.activeElement?.tagName));
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
});
