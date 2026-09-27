import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

test.beforeEach(async ({ page }) => seedExistingStudent(page));

test("the seeded student can move from capacity to plan, pathway, and evidence", async ({ page }) => {
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Complete Docker Networking Lab" })).toBeVisible();

  await page.getByRole("button", { name: /Low Capacity/ }).click();
  await page.getByRole("button", { name: "Update the plan with this capacity" }).click();
  await expect(page.getByRole("heading", { name: "Start the database research outline" })).toBeVisible({ timeout: 8_000 });

  await page.getByRole("link", { name: "Planner" }).click();
  await page.getByRole("button", { name: "Urgent deadline" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Schedule conflict detected" })).toBeVisible();
  await expect(page.getByText("Critical deadline protected", { exact: true })).toBeVisible({ timeout: 8_000 });

  await page.getByRole("link", { name: "Career Path" }).click();
  await page.getByRole("button", { name: "Verify" }).first().click();
  await expect(page.getByText("2 new pathway milestones unlocked")).toBeVisible();

  await page.getByRole("link", { name: "Intelligence" }).click();
  await page.getByRole("button", { name: "Add to Plan" }).first().click();
  await expect(page.getByText("Added to Wednesday, 7:00 PM").first()).toBeVisible();

  await page.getByRole("link", { name: "Overview" }).click();
  await page.getByRole("button", { name: "Why this?" }).click();
  await expect(page.getByText("Rules calculate priorities. Optimization schedules them. AI explains the result.")).toBeVisible();
});
