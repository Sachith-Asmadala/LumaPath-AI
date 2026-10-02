import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const headers = { "content-type": "application/json" };

const dashboard = {
  student_id: "student-onboarded",
  start_date: "2026-09-28",
  end_date: "2026-10-04",
  timezone: "Asia/Colombo",
  metric_version: "2026-10-v1",
  headline: [
    { key: "completed_tasks", label: "Completed tasks", value: 2, unit: "tasks", measurement_kind: "measured", data_status: "complete", definition: "Recorded completed tasks.", explanation: "Completion is explicit.", source_count: 2 },
    { key: "missed_deadlines", label: "Missed deadlines", value: 1, unit: "tasks", measurement_kind: "measured", data_status: "complete", definition: "Explicit missed outcomes.", explanation: "No inferred misses.", source_count: 1 },
    { key: "completion_rate", label: "Completion rate", value: 66.7, unit: "%", measurement_kind: "measured", data_status: "complete", definition: "Completed terminal outcomes / terminal outcomes.", explanation: "Future work is excluded.", source_count: 3 },
    { key: "productive_hours", label: "Productive hours", value: 3.5, unit: "h", measurement_kind: "mixed", data_status: "partial", definition: "Recorded productive minutes.", explanation: "Prototype mixes measured focus with manual-completion estimates.", source_count: 1 },
  ],
  daily_completion: [
    { period: "2026-09-28", value: 1, secondary_value: 0, measurement_kind: "measured" },
    { period: "2026-09-29", value: 0, secondary_value: 1, measurement_kind: "measured" },
    { period: "2026-10-01", value: 1, secondary_value: 0, measurement_kind: "measured" },
  ],
  module_trends: [
    { module: "Database Systems", workload_hours: 2, average_difficulty: 4, task_count: 1, source_ids: ["database-assignment"], history: [{ period: "2026-09-28", value: 1.5, secondary_value: 3, measurement_kind: "estimated" }, { period: "2026-10-01", value: 2, secondary_value: 4, measurement_kind: "estimated" }] },
    { module: "Software Engineering", workload_hours: 1.5, average_difficulty: 3, task_count: 1, source_ids: ["se-presentation"], history: [{ period: "2026-09-28", value: 1.5, secondary_value: 3, measurement_kind: "estimated" }] },
  ],
  estimate_accuracy: { key: "estimate_accuracy", label: "Estimate accuracy", value: 82, unit: "%", measurement_kind: "estimated", data_status: "partial", definition: "Estimate vs scheduled minutes.", explanation: "This is estimated planning alignment, not measured actual time accuracy.", source_count: 2 },
  readiness: { current_score: 72, movement: 4, history: [{ period: "2026-09-28T00:00:00+05:30", value: 68, secondary_value: null, measurement_kind: "measured" }, { period: "2026-10-01T20:00:00+05:30", value: 72, secondary_value: null, measurement_kind: "measured" }], reasons: ["Technical: 78% recorded"] },
  skills: [{ skill_id: "docker", current_proficiency: 68, status: "in-progress", history: [{ period: "2026-09-28T10:00:00+05:30", value: 52, secondary_value: null, measurement_kind: "measured" }, { period: "2026-10-01T20:00:00+05:30", value: 68, secondary_value: null, measurement_kind: "measured" }] }],
  plan_patterns: { reviewed: 4, accepted: 4, adjusted: 1, acceptance_rate: 100, adjustment_rate: 25, data_status: "partial", definition: "Accepted and adjusted plan definitions." },
  freshness: { latest_event_at: "2026-10-01T14:30:00+00:00", aggregate_computed_at: "2026-10-01T14:30:01+00:00", event_count: 19, is_partial: true, note: "Some signals are partial." },
  empty: false,
  empty_message: null,
};

test.beforeEach(async ({ page }) => {
  await seedExistingStudent(page);
  await page.route("**/api/analytics/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/analytics/sync") {
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ accepted_events: 12, duplicate_events: 0, aggregation_queued: true, latest_event_at: "2026-10-01T14:30:00Z" }) });
    }
    if (request.method() === "GET" && url.pathname === "/api/analytics/dashboard") {
      return route.fulfill({ status: 200, headers, body: JSON.stringify(dashboard) });
    }
    if (request.method() === "GET" && url.pathname.startsWith("/api/analytics/metrics/")) {
      const metric = url.pathname.split("/").pop() ?? "completed_tasks";
      return route.fulfill({ status: 200, headers, body: JSON.stringify({
        metric,
        start_date: "2026-09-28",
        end_date: "2026-10-04",
        timezone: "Asia/Colombo",
        definition: "This metric is derived from explicit private source events.",
        explanation: "Review the source record if a value looks wrong.",
        sources: [{ source_type: "task", source_id: "database-assignment", occurred_at: "2026-10-01T14:00:00Z", module: "Database Systems", measurement_kind: "measured", source_available: true, values: { status: "completed", estimated_minutes: 120 } }],
        freshness: dashboard.freshness,
      }) });
    }
    return route.continue();
  });
});

test("analytics shows private trends, freshness and source drill-down", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Progress you can act on" })).toBeVisible();
  await expect(page.getByText("Completed tasks")).toBeVisible();
  await expect(page.getByText("Module workload + difficulty")).toBeVisible();
  await expect(page.getByText("Readiness history")).toBeVisible();
  await expect(page.getByText("Plan adjustments")).toBeVisible();
  await expect(page.getByText(/Updated Oct 1/)).toBeVisible();

  await page.getByRole("button", { name: "Sources" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("This metric is derived from explicit private source events.");
  await expect(page.getByRole("dialog")).toContainText("Database Assignment");
  await expect(page.getByRole("link", { name: "Review source" })).toHaveAttribute("href", "/tasks");
});
