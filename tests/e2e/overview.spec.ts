import { expect, test } from "@playwright/test";

test("Life Load Check-In adjusts planning time without scoring the optional note", async ({ page }) => {
  await page.goto("/overview");
  await expect(page.getByText("Life Load Check-In")).toBeVisible();
  await page.getByRole("button", { name: /Low Capacity/ }).click();
  await page.locator("summary").filter({ hasText: "Life load factors" }).click();
  await page.getByRole("checkbox", { name: "Family responsibilities" }).check();
  await page.getByRole("combobox", { name: "Family responsibilities impact" }).click();
  await page.getByRole("option", { name: "High" }).click();
  await page.getByRole("checkbox", { name: "Relationship pressure" }).check();
  await page.getByRole("textbox", { name: "Anything else affecting your day?" }).fill("I need to help my family tonight.");
  await expect(page.getByText("45m available · low energy · low focus · heavy workload")).toBeVisible();
  await page.getByRole("button", { name: "Update the plan with this capacity" }).click();
  await expect(page.getByRole("heading", { name: "Start the database research outline" })).toBeVisible({ timeout: 8000 });
  await expect(page.getByText("You reported limited capacity today, so LumaPath protected your urgent work and moved lower-risk activities.").first()).toBeVisible();
});

test("Overview connects capacity, recovery, pathway and intelligence", async ({ page }) => {
  await page.goto("/overview");
  await expect(page.getByText("DevOps Readiness", { exact: true })).toBeVisible();
  await expect(page.getByText("Adaptive Day Plan", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Luma AI Copilot" })).toBeHidden();
  await page.getByRole("button", { name: /Low Capacity/ }).click();
  await page.getByRole("button", { name: "Update the plan with this capacity" }).click();
  await expect(page.getByLabel("Decision Engine updates")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start the database research outline" })).toBeVisible({ timeout: 8000 });
  await expect(page.getByText("Moved to Thursday 17:30", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update the plan with this capacity" })).toHaveText("Update My Plan");
  await page.getByRole("button", { name: "Why this?", exact: true }).click();
  await expect(page.getByLabel("Priority score breakdown")).toBeVisible();
  await expect(page.getByText("Rules calculate priorities. Optimization schedules them. AI explains the result.")).toBeVisible();
  await page.getByRole("button", { name: "Close priority explanation" }).click();
  await page.getByRole("button", { name: /Database Assignment.*92%/ }).click();
  await page.getByRole("button", { name: "Apply Recovery Plan" }).click();
  await expect(page.getByRole("button", { name: /Database Assignment.*68%/ })).toBeVisible({ timeout: 8000 });
  await page.getByRole("link", { name: "View Full Path" }).click();
  await page.getByRole("button", { name: "Verify", exact: true }).first().click();
  await expect(page.getByText("2 new pathway milestones unlocked")).toBeVisible({ timeout: 8000 });
  await expect(page.getByLabel("Decision Engine updates")).toContainText("+2 Readiness", { timeout: 8000 });
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("img", { name: "Career readiness 74 percent" })).toBeVisible();
  await expect(page.getByText("Docker verified → CI/CD available")).toHaveCount(1);
  await expect(page.getByText("Docker verified → CI/CD available")).toBeVisible();
  await page.getByRole("button", { name: "Add to Plan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Added to Plan", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "Planner", exact: true }).click();
  await expect(page.getByText("Container build caching patterns for faster CI").first()).toBeVisible();
});

test("Next Best Action changes recommendation and keeps the explanation in sync", async ({ page }) => {
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Complete Docker Networking Lab" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Priority Score: 86 / 100" })).toBeVisible();
  await expect(page.getByText("Deadline urgency", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Choose Alternative" }).click();
  await expect(page.getByRole("heading", { name: "Database Assignment" })).toBeVisible();
  await page.getByRole("button", { name: "Why this?" }).click();
  const breakdown = page.getByLabel("Priority score breakdown");
  for (const factor of ["Deadline urgency", "Career relevance", "Prerequisite importance", "Academic impact", "Capacity fit", "Effort penalty"]) {
    await expect(breakdown.getByText(factor, { exact: true })).toBeVisible();
  }
});

test("Overview connects the Docker recommendation to the path and readiness unlock", async ({ page }) => {
  await page.goto("/overview");
  const path = page.getByRole("list", { name: "Career pathway milestones" });
  await expect(path.getByRole("listitem", { name: "Docker, in progress" })).toBeVisible();
  await expect(path.getByRole("listitem", { name: "CI/CD, locked" })).toBeVisible();
  await expect(page.getByText("Docker 68%", { exact: true })).toBeVisible();
  await expect(page.getByText("Related to today's recommendation")).toBeVisible();
  await expect(page.getByRole("img", { name: "Career readiness 72 percent" })).toBeVisible();

  await page.getByRole("link", { name: "View Full Path" }).click();
  await page.getByRole("button", { name: "Verify", exact: true }).first().click();
  await expect(page.getByText("2 new pathway milestones unlocked")).toBeVisible({ timeout: 8000 });
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(path.getByRole("listitem", { name: "Docker, verified" })).toBeVisible();
  await expect(path.getByRole("listitem", { name: "CI/CD, available" })).toBeVisible();
  await expect(page.getByText("Docker Networking Lab · Completed").first()).toBeVisible();
  await expect(page.getByText("CI/CD unlocked").first()).toBeVisible();
  await expect(page.getByRole("img", { name: "Career readiness 74 percent" })).toBeVisible();
  await expect(page.getByText("+2 Readiness", { exact: true }).first()).toBeVisible();
});

test("Career Intelligence preview saves and plans a pathway update", async ({ page }) => {
  await page.goto("/overview");
  const preview = page.getByRole("region", { name: "Career Intelligence" });
  await expect(preview.getByRole("article")).toHaveCount(2);
  await expect(preview.getByText("Learning Update")).toBeVisible();
  await expect(preview.getByText("Missing:")).toBeVisible();
  await preview.getByRole("button", { name: "Save", exact: true }).click();
  await expect(preview.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Add to Plan", exact: true }).click();
  await expect(preview.getByRole("button", { name: "Added to Plan", exact: true })).toBeDisabled();
  await expect(page.getByText("Added to Wednesday, 7:00 PM", { exact: true }).first()).toBeVisible();
  await preview.getByRole("button", { name: "Prepare", exact: true }).click();
  await expect(preview.getByRole("button", { name: "Preparation planned" })).toBeDisabled();
});

test("Capacity presets show phased updates and a temporary Decision Pulse", async ({ page }) => {
  await page.goto("/overview");
  await page.getByRole("button", { name: /Low Capacity/ }).click();
  await expect(page.getByText("2h available · low energy · low focus · heavy workload")).toBeVisible();
  await page.getByText("Advanced", { exact: true }).click();
  await expect(page.getByLabel("Available time")).toBeVisible();

  await page.getByRole("button", { name: "Update the plan with this capacity" }).click();
  const pulse = page.getByLabel("Decision Engine updates");
  await expect(pulse).toContainText("LumaPath is adapting your day");
  expect(await pulse.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight && getComputedStyle(element).pointerEvents === "none";
  })).toBe(true);
  await expect(pulse).toContainText("Updating recommendation");
  await expect(pulse).toContainText("Capacity changed", { timeout: 8000 });
  await expect(pulse).toContainText("Risk recalculated");
  await expect(pulse).toContainText("Next action updated");
  await expect(pulse).toBeHidden({ timeout: 5000 });
});

test("Adaptive Day Plan shows the urgent slot and relocated lower-priority work", async ({ page }) => {
  await page.goto("/overview");
  await page.getByRole("link", { name: "Planner", exact: true }).click();
  await page.getByRole("button", { name: "Urgent deadline" }).click();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  const schedule = page.getByRole("list", { name: "Today's schedule" });
  await expect(schedule.getByText("Moved to Thursday 19:00")).toBeVisible({ timeout: 8000 });
  await expect(schedule.getByText("Database Assignment · urgent deadline")).toBeVisible();
});

for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
  test(`Overview fits ${viewport.width}px and respects reduced motion`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/overview");
    await expect(page.getByRole("heading", { name: "Complete Docker Networking Lab" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator(".context-graph-drift")).toHaveCSS("animation-name", "none");
    await page.getByRole("button", { name: /Low Capacity/ }).click();
    await page.getByRole("button", { name: "Update the plan with this capacity" }).click();
    await expect(page.getByRole("heading", { name: "Start the database research outline" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "View Full Path" }).click();
    await expect(page.getByRole("button", { name: "Verify", exact: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}
