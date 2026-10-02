import { test, expect } from "@playwright/test";

test("student previews sharing before creating mentor invite", async ({ page }) => {
  await page.goto("/mentors");
  await expect(page.getByRole("heading", { name: /Mentor Support/i })).toBeVisible();
  await page.getByLabel(/Mentor name or label/i).fill("Demo Mentor");
  await page.getByLabel(/Purpose of this relationship/i).fill("Review my roadmap milestones and help me choose one next evidence step.");
  await page.getByRole("button", { name: /Preview sharing/i }).click();
  await expect(page.getByText(/Consent preview/i)).toBeVisible();
  await expect(page.getByText(/Excluded from this mentor view/i)).toBeVisible();
  await page.getByRole("button", { name: /Create invite/i }).click();
  await expect(page.getByText(/shown once/i)).toBeVisible();
});

test("mentor support remains keyboard reachable and narrow-screen safe", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/mentors");
  await page.keyboard.press("Tab");
  await expect(page.locator("body")).not.toHaveJSProperty("scrollWidth", 10000);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  expect(overflow).toBe(false);
});
