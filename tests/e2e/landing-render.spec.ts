import { expect, test } from "@playwright/test";

test("landing content and original brand assets render before JavaScript", async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your next chapter. One clear step." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "One good next step." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Find my path", exact: true })).toBeVisible();
    const logo = page.getByRole("link", { name: "LumaPath AI home" }).locator("img:visible");
    await expect(logo).toHaveAttribute("src", /^\/brand\/lumapath-logo-/);
    await expect.poll(() => logo.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    for (const asset of ["lumapath-logo-light.png", "lumapath-logo-dark.png", "lumapath-icon.png"]) {
      const response = await request.get(`/brand/${asset}`);
      expect(response.ok(), asset).toBe(true);
      const bytes = await response.body();
      expect([...bytes.subarray(0, 8)], asset).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    }
  } finally {
    await context.close();
  }
});
