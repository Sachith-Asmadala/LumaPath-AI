import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const jsonHeaders = { "content-type": "application/json" };

test.beforeEach(async ({ page }) => {
  await seedExistingStudent(page);
  await page.route("**/api/study-assistant/**", async (route) => {
    const request = route.request();
    if (request.url().endsWith("/api/study-assistant/context")) return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ student_id: "student-onboarded", modules: 2, tasks: 7, learning_objectives: 2, materials: 0 }) });
    if (request.url().endsWith("/api/study-assistant/actions/approve")) return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ saved: true, action_id: "breakdown-action-1", kind: "task", message: "saved" }) });
    if (request.url().includes("/feedback")) return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ saved: true }) });
    if (request.url().endsWith("/api/study-assistant/respond")) {
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({
        response_id: "resp-test", session_id: "session-test", mode: "assignment_breakdown", title: "Assignment breakdown · Database Assignment",
        summary: "Three reviewable steps for the remaining work. Nothing is created until you approve it.",
        blocks: [{ kind: "steps", title: "Proposed task breakdown", body: "Keep, edit, or skip each item before saving.", items: [{ id: "step-1", title: "Confirm the deliverables", detail: "Read the brief first.", meta: "~20 min" }], quiz: [] }],
        context_used: [{ kind: "task", id: "database-assignment", label: "Database Assignment" }],
        why_this: "Database Assignment has the highest active academic risk and this plan stays within capacity.",
        proposed_actions: [{ id: "breakdown-action-1", kind: "task", title: "Database Assignment · Confirm the deliverables", source_context_ref: { kind: "task", id: "database-assignment", label: "Database Assignment" }, estimated_minutes: 20, start_at: "2026-09-28T16:00:00", due_at: "2026-09-30T23:59:00", category: "Academic", description: "Read the brief first.", quiz: [] }],
        citations: [], warnings: ["No saved learning material was available; course-specific claims are intentionally avoided."], general_guidance: true,
      }) });
    }
    return route.continue();
  });
});

test("student opens Study Assistant from a task, reviews structured context and approves a suggestion", async ({ page }) => {
  await page.goto("/tasks");
  await page.getByRole("link", { name: "Open Study Assistant for Database Assignment" }).click();
  await expect(page).toHaveURL(/study-assistant.*task=database-assignment/);
  await expect(page.getByRole("combobox", { name: "Study Assistant context" })).toHaveValue("task:database-assignment");
  await expect(page.getByRole("button", { name: /Break down an assignment/ })).toBeVisible();
  await page.getByRole("button", { name: "Ask Luma" }).click();
  await expect(page.getByRole("heading", { name: "Assignment breakdown · Database Assignment" })).toBeVisible();
  await expect(page.getByText("Used: Database Assignment")).toBeVisible();
  await expect(page.getByText("Why this suggestion?")).toBeVisible();
  await page.getByRole("button", { name: "Approve & save" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await expect(page.getByText("Database Assignment · Confirm the deliverables", { exact: true })).toBeVisible();
});
