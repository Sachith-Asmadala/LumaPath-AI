import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

test.beforeEach(async ({ page }) => {
  let persistedLocale = "en";
  await seedExistingStudent(page);
  await page.addInitScript(() => window.localStorage.removeItem("lumapath.locale.v1"));
  await page.route("**/api/profile/locale", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ locale: persistedLocale, translation_version: "2026-10-01.1" }) });
    }
    if (request.method() === "PUT") {
      const payload = request.postDataJSON() as { locale?: string };
      persistedLocale = payload.locale ?? "en";
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ locale: persistedLocale, translation_version: "2026-10-01.1" }) });
    }
    return route.continue();
  });
  await page.route("**/api/profile/translation-reports", (route) => route.fulfill({ status: 204, body: "" }));
});

test("locale switch persists and keeps core navigation accessible", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  const sinhala = page.getByRole("radio", { name: /සිංහල/ });
  await sinhala.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "si-LK");
  await expect(page.getByRole("link", { name: "කාර්යයන්" })).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "si-LK");
  await expect(page.getByRole("link", { name: "සැලසුම්කරු" })).toBeVisible();

  const tamil = page.getByRole("radio", { name: /தமிழ்/ });
  await tamil.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "ta-LK");
  await expect(page.getByRole("link", { name: "பணிகள்" })).toBeVisible();
});

test("Sinhala and Tamil layouts remain usable at narrow width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/settings");

  for (const languageName of ["සිංහල", "தமிழ்"]) {
    const radio = page.getByRole("radio", { name: new RegExp(languageName) });
    await radio.focus();
    await page.keyboard.press("Enter");
    await expect(radio).toHaveAttribute("aria-checked", "true");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  }
});
