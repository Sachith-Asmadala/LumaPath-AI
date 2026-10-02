import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

test("landing stays public and its preview responds to keyboard selection", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your next chapter. One clear step." })).toBeVisible();
  await page.getByRole("button", { name: "Your direction", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "A future taking shape." })).toBeVisible();
  await page.getByRole("button", { name: "Your pace", exact: true }).press("Space");
  await expect(page.getByRole("heading", { name: "Progress, on your terms." })).toBeVisible();
  await page.getByRole("link", { name: "Log in", exact: true }).first().click();
  await expect(page).toHaveURL(/\/login$/);
});

test("prototype registration prefills the shared profile without retaining credentials", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Your name", { exact: true }).fill("Alex Morgan");
  await page.getByLabel("Email address").fill("alex@example.com");
  await page.getByLabel("Password", { exact: true }).fill("sample-password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Start my journey" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByLabel("Full name")).toHaveValue("Alex Morgan");
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(storage).not.toContain("sample-password");
  expect(storage).not.toContain("alex@example.com");
});

test("returning students can log in and resume after onboarding", async ({ page }) => {
  await seedExistingStudent(page);
  await page.goto("/login");
  await page.getByLabel("Email address").fill("student@example.com");
  await page.getByLabel("Password", { exact: true }).fill("demo-password");
  await page.getByRole("button", { name: "Continue to LumaPath" }).click();
  await expect(page).toHaveURL(/\/assessment$/);
});

test("settings sign out preserves progress and requires re-entry after reload", async ({ page }) => {
  await seedExistingStudent(page);
  await page.goto("/settings");
  const signOut = page.getByRole("button", { name: "Sign out", exact: true });
  await expect(signOut).toBeVisible();
  const savedProgress = () => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("lumapath-demo-state-v1")!);
    return { tasks: state.tasks, evidence: state.evidence, onboarding: state.onboarding, assessment: state.assessment };
  });
  const before = await savedProgress();
  await signOut.click();
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(savedProgress).toEqual(before);
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/login$/);
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email address").fill("student@example.com");
  await page.getByLabel("Password", { exact: true }).fill("demo-password");
  await page.getByRole("button", { name: "Continue to LumaPath" }).click();
  await expect(page).toHaveURL(/\/assessment$/);
  await page.goto("/settings");
  await expect(signOut).toBeVisible();
  await expect.poll(savedProgress).toEqual(before);
});

for (const theme of ["light", "dark"]) {
  test(`public pages fit mobile and tablet widths in ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
    for (const width of [360, 390, 430, 768]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/", "/login", "/register"]) {
        await page.goto(route);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.locator("html")).toHaveClass(new RegExp(theme));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route} at ${width}px`).toBe(true);
      }
    }
  });
}
