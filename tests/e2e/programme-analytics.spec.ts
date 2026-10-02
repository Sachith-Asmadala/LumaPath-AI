import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const jsonHeaders = { "content-type": "application/json" };

const cohort = {
  id: "se-y3-2024",
  name: "Software Engineering — Year 3",
  institution_id: "luma-demo-university",
  definition: { programme: "Software Engineering", year: 3, intake: "2024" },
  metric_version: "2026-10-doc-f25-v1",
  privacy_threshold: 10,
  privacy_status: "eligible",
};

const metrics = [
  ["skill_gap_points", "Average skill gap", "skills", "points", 12.4],
  ["readiness_average", "Average career readiness", "readiness", "%", 73.2],
  ["workload_hours", "Average active workload", "workload", "h/student", 9.6],
  ["engagement_rate", "Recorded engagement", "engagement", "%", 81.8],
  ["internship_preparation_rate", "Internship preparation activity", "internship_preparation", "%", 63.6],
  ["mentoring_demand_rate", "Mentoring support demand", "support_demand", "%", 27.3],
  ["workshop_interest_rate", "Workshop interest", "support_demand", "%", 36.4],
].map(([key, label, category, unit, value]) => ({
  key,
  label,
  category,
  unit,
  value,
  sample_size: 11,
  suppressed: false,
  suppression_reason: null,
  definition: "Anonymous aggregate programme signal.",
  formula: "Documented aggregate formula.",
  trend: [
    { period: "2026-09-03", value: Number(value) - 3, suppressed: false },
    { period: "2026-09-10", value: Number(value) - 1, suppressed: false },
    { period: "2026-09-17", value: Number(value), suppressed: false },
  ],
}));

test.beforeEach(async ({ page }) => {
  await seedExistingStudent(page);
  await page.route("**/api/institutional-analytics/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/institutional-analytics/cohorts") {
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify([cohort]) });
    }
    if (url.pathname === "/api/institutional-analytics/definitions") {
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify(metrics.map((metric) => ({
        key: metric.key,
        label: metric.label,
        category: metric.category,
        unit: metric.unit,
        formula: metric.formula,
        explanation: metric.definition,
        source_domains: ["Approved aggregate source"],
        metric_version: cohort.metric_version,
        approved: true,
        approved_purpose: "student_support_programme_improvement",
      }))) });
    }
    if (url.pathname === "/api/institutional-analytics/governance") {
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({
        purpose: "student_support_programme_improvement",
        retention_days: 365,
        privacy_threshold: 10,
        metric_version: cohort.metric_version,
        approved_metrics: metrics.map((metric) => metric.key),
        prohibited_uses: ["individual surveillance", "disciplinary scoring"],
      }) });
    }
    if (url.pathname === "/api/institutional-analytics/dashboard") {
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({
        cohort,
        start_date: url.searchParams.get("start"),
        end_date: url.searchParams.get("end"),
        timezone: "Asia/Colombo",
        metrics,
        skill_slices: [
          { metric_key: "skill_gap_points", dimension_key: "docker", dimension_label: "Docker", value: 18.2, unit: "points", sample_size: 11, suppressed: false, suppression_reason: null },
          { metric_key: "skill_gap_points", dimension_key: "kubernetes", dimension_label: "Kubernetes", value: null, unit: "points", sample_size: null, suppressed: true, suppression_reason: "Suppressed: fewer than 10 contributors for this skill slice." },
        ],
        freshness: { refreshed_at: "2026-10-02T02:00:00Z", source_latest_at: "2026-10-01T15:00:00Z", metric_version: cohort.metric_version, is_stale: false, retention_days: 365, purpose: "student_support_programme_improvement" },
        capabilities: { can_export: true, can_refresh: true },
        empty: false,
        message: null,
        governance_notice: "Anonymous aggregate trends are for student-support programme improvement only.",
      }) });
    }
    if (url.pathname.includes("/refresh")) {
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ cohort_id: cohort.id, start_date: "2026-09-03", end_date: "2026-10-02", metric_version: cohort.metric_version, refreshed_at: "2026-10-02T03:00:00Z", aggregate_rows: 9, suppressed_rows: 1 }) });
    }
    if (url.pathname === "/api/institutional-analytics/export") {
      return route.fulfill({ status: 200, headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=\"aggregate.csv\"" }, body: "metric_key,value\nreadiness_average,73.2\n" });
    }
    return route.continue();
  });
});

test("programme administrator sees privacy-safe aggregate trends and metric definitions", async ({ page }) => {
  await page.goto("/programme-analytics");
  await expect(page.getByRole("heading", { name: "Cohort trends for better student support" })).toBeVisible();
  await expect(page.getByText("Software Engineering — Year 3")).toBeVisible();
  await expect(page.getByText("Average career readiness")).toBeVisible();
  await expect(page.getByText("Internship preparation activity")).toBeVisible();
  await expect(page.getByText("Mentoring support demand")).toBeVisible();
  await expect(page.getByText("Workshop interest")).toBeVisible();
  await expect(page.getByText("Privacy-safe skill gap slices")).toBeVisible();
  await expect(page.getByText(/Slice hidden because too few contributors/)).toBeVisible();

  await page.getByRole("button", { name: /Definition/ }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Documented aggregate formula");
  await expect(page.getByRole("dialog")).toContainText("Approved metric");
});
