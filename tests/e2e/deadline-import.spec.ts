import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

test.beforeEach(async ({ page }) => seedExistingStudent(page));

test("imports demo LMS deadlines through Tasks and updates the shared plan", async ({ page }) => {
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("menuitem", { name: "University LMS" }).click();
  await expect(page.getByRole("heading", { name: "Smart Deadline Import" })).toBeVisible();
  await page.getByRole("button", { name: "Sync University" }).click();
  await expect(page.getByRole("heading", { name: "3 assignments found" })).toBeVisible();
  await page.getByRole("button", { name: "Import All" }).click();
  await expect(page.getByLabel("Decision Engine updates")).toContainText("3 deadlines imported", { timeout: 8000 });
  await expect(page.getByText("In your tasks")).toHaveCount(3);
  await page.getByRole("link", { name: "Back to Tasks" }).click();
  await expect(page.getByText("Network Security Lab")).toBeVisible();
  await expect(page.getByText("Cloud Architecture Report")).toBeVisible();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("menuitem", { name: "University LMS" }).click();
  await page.getByRole("button", { name: "Sync University" }).click();
  await expect(page.getByRole("button", { name: "Update All" })).toBeVisible();
});
