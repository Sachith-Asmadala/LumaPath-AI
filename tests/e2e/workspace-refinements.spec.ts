import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

test.beforeEach(async ({ page }) => seedExistingStudent(page));

test("task search leads into a controlled focus session", async ({ page }) => {
  await page.goto("/tasks");
  await page.getByRole("searchbox", { name: "Search tasks" }).fill("Database Assignment");
  await expect(page.getByRole("heading", { name: "Database Assignment", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Docker Networking Lab" })).toHaveCount(0);
  await page.getByRole("button", { name: "Focus on Database Assignment" }).click();
  await expect(page).toHaveURL(/\/focus/);
  await page.getByRole("button", { name: "25 min", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.getByRole("button", { name: /Start focus session/ }).click();
  await page.clock.fastForward(10_000);
  await expect(page.getByText("24:50", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset timer" }).click();
  await expect(page.getByText("25:00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Start focus session/ }).click();
  await page.clock.fastForward(25 * 60_000);
  await expect(page.getByText("00:00", { exact: true })).toBeVisible();
  await expect(page.getByText("Time is up. Save your session when you’re ready.")).toBeVisible();
  await page.getByRole("button", { name: "Complete Session", exact: true }).click();
  await page.clock.runFor(500);
  await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("lumapath-demo-state-v1")!).productiveMinutes)).toBe(25);
});

test("saved intelligence can be revisited, planned, and kept out of duplicate scheduling", async ({ page }) => {
  await page.goto("/intelligence");
  await page.getByRole("button", { name: "Save Complete Kubernetes Fundamentals", exact: true }).click();
  await page.getByRole("group", { name: "Intelligence collection" }).getByRole("button", { name: /Saved/ }).click();
  await expect(page.getByRole("heading", { name: "Complete Kubernetes Fundamentals" })).toBeVisible();
  await page.getByRole("button", { name: "Add to Plan", exact: true }).click();
  await page.getByRole("group", { name: "Intelligence collection" }).getByRole("button", { name: /In your plan/ }).click();
  await expect(page.getByRole("link", { name: "Open in Planner" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to Plan", exact: true })).toHaveCount(0);
});

test("agenda, skill cards, evidence filters and chart table are accessible", async ({ page }) => {
  await page.goto("/planner");
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(page.getByLabel("Plan agenda")).toBeVisible();
  await page.getByRole("button", { name: "View Database Assignment", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goto("/career-path");
  await page.getByRole("button", { name: "Skill cards", exact: true }).click();
  await expect(page.getByRole("list", { name: "DevOps career pathway" })).toBeVisible();
  await page.goto("/evidence");
  await page.getByRole("searchbox", { name: "Search evidence" }).fill("no such evidence");
  await expect(page.getByRole("heading", { name: "No evidence in this view" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("heading", { name: "No evidence in this view" })).toHaveCount(0);
  await page.goto("/analytics");
  await page.getByRole("button", { name: "View data", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(8);
});
