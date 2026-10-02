import { expect, test, type Page } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

async function enter(page: Page) {
  await seedExistingStudent(page, { showWelcome: true });
  await page.goto("/overview");
  await page.getByRole("button", { name: "Continue with Free", exact: true }).click();
}

test("Pro introduction is dismissible and stays dismissed on return", async ({ page }) => {
  await seedExistingStudent(page, { showWelcome: true });
  await page.goto("/overview");
  const welcome = page.getByRole("dialog");
  await expect(welcome).toContainText("INTRODUCING LUMAPATH PRO");
  await page.keyboard.press("Escape");
  await expect(welcome).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(welcome).toBeHidden();
  await page.goto("/plans");
  await expect(page.getByRole("heading", { name: "LumaPath Pro", exact: true })).toBeVisible();
  await expect(page.getByText(/pricing to be announced/)).toBeVisible();
});

test("overview separates daily actions from growth and keeps capacity accessible", async ({ page }) => {
  await enter(page);
  await expect(page.getByText("Adaptive Day Plan", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "My growth", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Small steps. Meaningful progress." })).toBeVisible();
  await expect(page.getByText("Adaptive Day Plan", { exact: true })).toBeHidden();
  await page.getByRole("tab", { name: "Today’s overview", exact: true }).click();
  await page.getByRole("link", { name: /Available capacity/ }).click();
  await expect(page.getByRole("button", { name: "Update the plan with this capacity" })).toBeVisible();
  await page.getByRole("button", { name: "Why this?", exact: true }).click();
  await expect(page.getByLabel("Priority score breakdown")).toBeVisible();
});

test("directory filters tools, handles no results, and navigates to a tool", async ({ page }) => {
  await enter(page);
  await page.goto("/explore");
  await expect(page.locator(".directory-tool")).toHaveCount(24);
  const search = page.getByRole("textbox", { name: "Search workspace tools" });
  await search.fill("interview");
  await expect(page.locator(".directory-tool")).toHaveCount(1);
  await search.fill("nothing-matches-this");
  await expect(page.getByRole("heading", { name: "No tools found" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByLabel("Tool categories").getByRole("button", { name: "Learn & grow", exact: true }).click();
  await expect(page.locator(".directory-tool")).toHaveCount(4);
  await page.locator('.directory-tool[href="/documents"]').click();
  await expect(page).toHaveURL(/\/documents$/);
});

test("mobile navigation is legible and every category remains reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "More", exact: true }).click();
  const sidebar = page.getByRole("dialog", { name: "Sidebar" });
  await expect(sidebar).toBeVisible();
  await page.getByRole("button", { name: "Build your career", exact: true }).click();
  await sidebar.getByRole("link", { name: "CV Review", exact: true }).click();
  await expect(page).toHaveURL(/\/cv$/);
  await expect(sidebar).toBeHidden();
});

test("focus scenes persist, can pause, and respect reduced motion", async ({ page }) => {
  await seedExistingStudent(page, { showWelcome: true });
  await page.route("**/api/focus/sessions/active", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await page.goto("/focus");
  await page.getByRole("button", { name: "Ocean", exact: true }).click();
  await expect(page.locator(".focus-environment")).toHaveAttribute("data-scene", "ocean");
  await page.getByRole("button", { name: "Pause background animation" }).click();
  await expect(page.locator(".focus-environment")).toHaveAttribute("data-paused", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Ocean", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".focus-environment")).toHaveAttribute("data-paused", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("button", { name: "Motion off: reduced motion preference" })).toBeDisabled();
});


test("compact task rows keep details and completion available", async ({ page }) => {
  await seedExistingStudent(page);
  await page.goto("/tasks");
  const task = page.locator(".task-list-item").filter({ has: page.getByRole("heading", { name: "Database Assignment", exact: true }) });
  await task.getByRole("button", { name: "Show details for Database Assignment" }).click();
  await expect(task.locator(".task-list-detail")).toBeVisible();
  await expect(task.getByRole("link", { name: "Open Study Assistant for Database Assignment" })).toBeVisible();
  await task.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(task).toHaveCount(0);
  await page.getByRole("button", { name: /^Completed/ }).click();
  await expect(task).toHaveAttribute("data-complete", "true");
});
