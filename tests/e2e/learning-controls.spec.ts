import { expect, test } from "@playwright/test";
import { baselineQuestions } from "../../src/lib/domain/baseline-assessment";

const answers = Object.fromEntries(baselineQuestions.map((question) => [question.id, question.options[question.id === "docker-compose" || ["CI/CD", "Cloud"].includes(question.skill) ? 1 : 0]]));
test("learning, certificates and privacy controls share persisted student state", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript((baseline) => {
    if (localStorage.getItem("lumapath-demo-state-v1")) return;
    localStorage.setItem("lumapath-onboarding-v1", JSON.stringify({ completed: true, name: "Nila", university: "Demo University", degree: "Computing", academicYear: "Year 2", semester: "Semester 1", currentModules: "Networks", careerGoal: "DevOps Engineer", weeklyLearningHours: 8, budget: "free only", preferredLearning: ["hands-on"], language: "English", goal: "internship" }));
    localStorage.setItem("lumapath-baseline-v1", JSON.stringify({ answers: baseline }));
  }, answers);
  await page.goto("/career-path/docker/free-path");
  await page.getByRole("button", { name: "Add Free Path to My Plan" }).click();
  await page.getByRole("button", { name: "Add to My Plan", exact: true }).click();
  await expect(page).toHaveURL(/\/planner$/);
  await page.goto("/learning");
  await page.getByText("Set a career learning goal", { exact: false }).first().click();
  await page.getByLabel("Your goal", { exact: true }).fill("Build a container portfolio");
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Goal saved" })).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => localStorage.setItem("theme", value), theme);
    for (const width of [360, 390, 430, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await expect(page.getByRole("heading", { name: "Your learning, connected" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  }
  await page.goto("/evidence");
  await page.getByText("Add an external certificate", { exact: true }).click();
  await page.getByLabel("Certificate title", { exact: true }).fill("My earned certificate");
  await page.getByLabel("Provider", { exact: true }).fill("Example provider");
  await page.getByLabel("Course name", { exact: true }).fill("Container foundations");
  await page.getByLabel("Completion date", { exact: true }).fill("2026-01-01");
  await page.getByLabel("Certificate URL", { exact: true }).fill("https://example.com/earned/123");
  await page.getByRole("button", { name: "Save certificate", exact: true }).click();
  await expect(page.getByText("External · self-reported", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove record", exact: true }).click();
  await expect(page.getByText("External · self-reported", { exact: true })).toHaveCount(0);
  await page.goto("/overview");
  await page.getByText("Life load factors", { exact: false }).first().click();
  await page.getByLabel("Anything else affecting your day?", { exact: true }).fill("Family commitments tonight");
  await page.getByRole("button", { name: "Update the plan with this capacity" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("lumapath-demo-state-v1")!).capacity.lifeLoadNote)).toBe("Family commitments tonight");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Clear private check-in details" }).click();
  await expect(page.getByRole("button", { name: "Clear private check-in details" })).toBeDisabled();
  await page.getByRole("link", { name: "View plans", exact: true }).click();
  await expect(page).toHaveURL(/\/plans$/);
});
