import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

test("pricing shows plans and genuinely changes the persisted demo subscription", async ({ page }) => {
  await seedExistingStudent(page);
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "LumaPath Free", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "LumaPath Pro", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "LumaPath Institution", exact: true })).toBeVisible();
  const switcher = page.getByLabel("Competition Demo Plan", { exact: true });
  await expect(switcher).toBeEnabled();
  await switcher.selectOption("pro");
  await expect(page.locator(".membership-plus").getByText("CURRENT PLAN", { exact: true })).toBeVisible();
  await page.reload();
  await expect(switcher).toHaveValue("pro");
  await switcher.selectOption("institution");
  await expect(page.locator(".membership-card").filter({ has: page.getByRole("heading", { name: "LumaPath Institution", exact: true }) }).getByText("CURRENT PLAN")).toBeVisible();
  await switcher.selectOption("free");
  await expect(switcher).toHaveValue("free");
  await expect(page.getByRole("heading", { name: "Room for your next step" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a structured comparison limit renders a useful upgrade state", async ({ page }) => {
  await seedExistingStudent(page);
  await page.route("**/api/career-scenarios", async (route) => {
    await route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ code: "PLAN_LIMIT_REACHED", feature: "career_comparisons", plan: "free", limit: 2, used: 2, upgrade_required: true, required_plan: "pro" }) });
  });
  await page.goto("/career-compare");
  await page.getByRole("button", { name: "Compare careers", exact: true }).click();
  const upgrade = page.getByRole("dialog");
  await expect(upgrade).toContainText("You've used your 2 free career comparisons this month.");
  await upgrade.getByRole("link", { name: "View LumaPath Pro" }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole("heading", { name: "LumaPath Pro", exact: true })).toBeVisible();
});
