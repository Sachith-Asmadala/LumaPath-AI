import { expect, test, type Page } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

async function planFixture(page: Page, { initialPlan = "free", failSwitch = false, demoEnabled = true } = {}) {
  let plan = initialPlan;
  await seedExistingStudent(page);
  await page.route("**/api/subscriptions/**", async route => {
    const request = route.request();
    if (request.url().endsWith("/demo-plan")) {
      if (failSwitch) { await route.fulfill({ status: 503, json: { detail: "Could not change the demo plan." } }); return; }
      plan = request.postDataJSON().plan;
    }
    await route.fulfill({ json: { subject_id: request.headers()["x-luma-student-id"], plan, name: `LumaPath ${plan[0].toUpperCase()}${plan.slice(1)}`, entitlements: {}, demo_switch_enabled: demoEnabled, billing_connected: false, period_timezone: "UTC" } });
  });
}

test("Free forces light, Pro unlocks richer details, and downgrade preserves student work", async ({ page }) => {
  test.setTimeout(120_000);
  await planFixture(page);
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/overview");
  const demo = page.getByRole("region", { name: "Plan demo workspace" });
  await expect(demo.getByRole("heading", { name: "Your Free demo" })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(demo.locator("article")).toHaveCount(3);
  await expect(demo.getByRole("tab")).toHaveCount(0);
  await expect(demo.getByRole("heading", { name: "Add a test gate to your release pipeline" })).toHaveCount(0);
  const originalTasks = await page.evaluate(() => JSON.parse(localStorage.getItem("lumapath-demo-state-v1")!).tasks);
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Dark · Included with Pro", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "System · Included with Pro", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Light", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/pricing");
  await expect(page.getByRole("region", { name: "Free and Pro comparison" })).toContainText("Light, dark & system");
  await page.getByLabel("Competition Demo Plan", { exact: true }).selectOption("pro");
  await expect(page.locator(".membership-plus").getByText("CURRENT PLAN")).toBeVisible();
  await page.getByRole("link", { name: "Explore my Pro demo", exact: true }).click();
  await expect(demo.getByRole("heading", { name: "Your Pro demo" })).toBeVisible();
  await expect(demo.locator("article")).toHaveCount(8);
  await demo.locator("article").first().getByText("Why it matters & next step").click();
  await expect(demo).toContainText("Compare image sizes, run a smoke test");
  await demo.getByRole("tab", { name: "Career scenarios", exact: true }).click();
  await expect(demo.getByRole("heading", { name: /route$/ })).toHaveCount(3);
  await demo.getByText("Calculation history", { exact: true }).first().click();
  await expect(demo.getByText(/At 4 hours\/week/)).toBeVisible();
  await demo.getByRole("tab", { name: "Regional insights", exact: true }).click();
  await expect(demo.getByRole("heading", { name: "Sri Lanka", exact: true })).toBeVisible();
  await expect(demo.getByRole("heading", { name: "Singapore", exact: true })).toBeVisible();
  await demo.getByRole("tab", { name: "Preparation", exact: true }).click();
  await expect(demo.locator("ol > li")).toHaveCount(4);
  await demo.getByRole("tab", { name: "Adaptive planning", exact: true }).click();
  await expect(demo).toContainText("30 min Thursday");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.goto("/pricing");
  await page.getByLabel("Competition Demo Plan", { exact: true }).selectOption("free");
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.getByRole("link", { name: "Explore my Free demo", exact: true }).click();
  await expect(demo.getByRole("heading", { name: "Your Free demo" })).toBeVisible();
  await expect(demo.locator("article")).toHaveCount(3);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("lumapath-demo-state-v1")!).tasks)).toEqual(originalTasks);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/light/);
});

test("Pro previews fit mobile and Institution includes Pro appearance", async ({ page }) => {
  await planFixture(page, { initialPlan: "institution" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/overview");
  const demo = page.getByRole("region", { name: "Plan demo workspace" });
  await expect(demo.getByRole("heading", { name: "Your Pro demo" })).toBeVisible();
  for (const name of ["Career updates", "Career scenarios", "Regional insights", "Preparation", "Adaptive planning"]) {
    await demo.getByRole("tab", { name, exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto("/settings");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "System", exact: true }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.goto("/pricing");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("failed switching leaves Free content locked and disabled demos show no fixtures", async ({ page }) => {
  await planFixture(page, { failSwitch: true });
  await page.goto("/pricing");
  await page.getByLabel("Competition Demo Plan", { exact: true }).selectOption("pro");
  await expect(page.getByRole("alert").filter({ hasText: "Could not change the demo plan." })).toBeVisible();
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Your Free demo" })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.unroute("**/api/subscriptions/**");
  await planFixture(page, { demoEnabled: false });
  await page.reload();
  await expect(page.getByRole("region", { name: "Plan demo workspace" })).toHaveCount(0);
});
