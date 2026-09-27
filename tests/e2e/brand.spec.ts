import { expect, test } from "@playwright/test";

test("brand follows theme and sidebar state without a reload", async ({ page }) => {
  await page.goto("/settings");
  const home = page.getByRole("link", { name: "LumaPath AI home" }).first();
  await expect(home.locator('img[src*="lumapath-logo-dark"]')).toBeVisible();

  await page.getByRole("button", { name: "light", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(home.locator('img[src*="lumapath-logo-light"]')).toBeVisible();
  await expect(home.locator('img[src*="lumapath-logo-dark"]')).toBeHidden();

  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByRole("button", { name: "system", exact: true }).click();
  await expect(home.locator('img[src*="lumapath-logo-dark"]')).toBeVisible();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(home.locator('img[src*="lumapath-logo-light"]')).toBeVisible();

  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(home.locator('img[src*="lumapath-icon"]')).toBeVisible();
  await expect(home.locator('img[src*="lumapath-logo-light"]')).toBeHidden();
});

test("mobile header uses the symbol and app icons are served", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/overview");
  await expect(page.getByRole("link", { name: "LumaPath AI home" }).last().locator('img[src*="lumapath-icon"]')).toBeVisible();
  for (const asset of ["/favicon.ico", "/icon.png", "/apple-icon.png", "/manifest.webmanifest", "/brand/icon-192.png", "/brand/icon-512.png"]) {
    const response = await request.get(asset);
    expect(response.ok(), asset).toBeTruthy();
  }
});
