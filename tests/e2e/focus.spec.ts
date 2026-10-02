import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const headers = { "content-type": "application/json" };
let current: Record<string, unknown> | null;

function runningSession() {
  return {
    id: "focus-test", task_id: "database-assignment", task_title: "Database Assignment",
    objective: "Finish the indexing comparison section", planned_work_minutes: 25, planned_break_minutes: 5,
    task_estimated_minutes: 120, task_progress_before: 58, task_progress_after: null,
    status: "running", persisted_status: "running", started_at: new Date().toISOString(), active_segment_started_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString(),
    paused_at: null, ended_at: null, accumulated_active_seconds: 0, elapsed_work_seconds: 0, remaining_work_seconds: 1500,
    break_due: false, notes: "", next_step: "", result: null, estimate_feedback: null,
    suggested_estimated_minutes: null, estimate_explanation: null, productive_minutes: 0, updated_at: new Date().toISOString(),
  };
}

test.beforeEach(async ({ page }) => {
  current = null;
  await seedExistingStudent(page);
  await page.route("**/api/focus/sessions**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/focus/sessions/active" && request.method() === "GET") return route.fulfill({ status: 200, headers, body: JSON.stringify(current) });
    if (url.pathname === "/api/focus/sessions" && request.method() === "POST") {
      const payload = request.postDataJSON();
      current = { ...runningSession(), task_id: payload.task_id, task_title: payload.task_title, objective: payload.objective, planned_work_minutes: payload.planned_work_minutes, planned_break_minutes: payload.planned_break_minutes, task_progress_before: payload.task_progress_before };
      return route.fulfill({ status: 201, headers, body: JSON.stringify(current) });
    }
    if (url.pathname.endsWith("/heartbeat")) { current = { ...current, last_heartbeat_at: new Date().toISOString() }; return route.fulfill({ status: 200, headers, body: JSON.stringify(current) }); }
    if (url.pathname.endsWith("/pause")) {
      current = { ...current, status: "paused", persisted_status: "paused", active_segment_started_at: null, paused_at: new Date().toISOString(), accumulated_active_seconds: 600, elapsed_work_seconds: 600, remaining_work_seconds: 900 };
      return route.fulfill({ status: 200, headers, body: JSON.stringify(current) });
    }
    if (url.pathname.endsWith("/resume")) {
      current = { ...current, status: "running", persisted_status: "running", active_segment_started_at: new Date().toISOString(), paused_at: null };
      return route.fulfill({ status: 200, headers, body: JSON.stringify(current) });
    }
    if (url.pathname.endsWith("/finish")) {
      const payload = request.postDataJSON();
      current = { ...current, status: payload.result, persisted_status: payload.result, result: payload.result, ended_at: new Date().toISOString(), task_progress_after: payload.task_progress_after, notes: payload.notes, next_step: payload.next_step, productive_minutes: payload.result === "completed" ? 10 : 0, suggested_estimated_minutes: payload.result === "completed" ? 110 : null, estimate_explanation: payload.result === "completed" ? "Measured focus time was blended with the prior estimate." : "Interrupted or abandoned sessions do not change future duration estimates." };
      return route.fulfill({ status: 200, headers, body: JSON.stringify(current) });
    }
    if (url.pathname.includes("/api/focus/sessions/") && request.method() === "GET") return route.fulfill({ status: 200, headers, body: JSON.stringify(current) });
    return route.continue();
  });
});

test("task focus flow reviews progress before productive time is recorded", async ({ page }) => {
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Focus on Database Assignment" }).click();
  await expect(page).toHaveURL(/focus\?task=database-assignment/);
  await expect(page.getByRole("heading", { name: "Set up a focus session" })).toBeVisible();
  await page.getByLabel("Clear objective").fill("Finish the indexing comparison section");
  await page.getByRole("button", { name: "Start focus session" }).click();
  await expect(page.getByRole("heading", { name: "Finish the indexing comparison section" })).toBeVisible();
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByRole("heading", { name: "What changed?" })).toBeVisible();
  await page.getByLabel("Task progress after this session").fill("70");
  await page.getByLabel("Notes (optional)").fill("Index examples are drafted.");
  await page.getByRole("button", { name: "Save and close" }).click();
  await expect(page.getByRole("heading", { name: "Progress recorded clearly." })).toBeVisible();
  await expect(page.getByText("10 measured focus minutes")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Progress recorded clearly." })).toBeVisible();
});
