import { expect, test } from "@playwright/test";
import { baselineQuestions } from "../../src/lib/domain/baseline-assessment";

test("a new student reaches Overview through the free DevOps path and can reset the whole journey", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 15_000 });
  await page.getByRole("textbox", { name: "Full name" }).fill("Asha Perera");
  await page.getByRole("textbox", { name: "University" }).fill("Colombo University");
  await page.getByRole("textbox", { name: "Degree" }).fill("Computer Science");
  await page.getByLabel("Academic year").selectOption("Year 3");
  await page.getByLabel("Semester").selectOption("Semester 1");
  await page.getByRole("textbox", { name: "Current modules" }).fill("Databases, Networks");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("radio", { name: /DevOps Engineer/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Weekly learning hours" }).fill("8");
  await page.getByRole("button", { name: "hands-on" }).click();
  await page.getByRole("button", { name: "Assess My Starting Point" }).click();
  await expect(page).toHaveURL(/\/assessment$/);

  for (let index = 0; index < baselineQuestions.length; index += 1) {
    const question = baselineQuestions[index];
    const choiceIndex = question.id === "docker-compose" || ["CI/CD", "Cloud"].includes(question.skill) ? 1 : 0;
    await page.getByRole("group", { name: question.question }).getByRole("radio").nth(choiceIndex).press("Space");
    await page.getByRole("button", { name: index === baselineQuestions.length - 1 ? "Submit Assessment" : "Next", exact: true }).click();
  }

  await expect(page).toHaveURL(/\/assessment\/results$/);
  await expect(page.getByRole("heading", { name: "Docker", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Build My Learning Path" }).click();
  await expect(page).toHaveURL(/\/career-path$/);
  const docker = page.locator(".react-flow__node").filter({ has: page.getByRole("heading", { name: "Docker", exact: true }) });
  await docker.getByRole("link", { name: "Find Learning Resources" }).click();
  await expect(page.getByRole("heading", { name: "Find learning resources for Docker" })).toBeVisible();
  await page.getByRole("link", { name: "View Free Learning Path" }).click();
  await page.getByRole("button", { name: "Add Free Path to My Plan" }).click();
  await page.getByRole("button", { name: "Add to My Plan" }).click();
  await expect(page).toHaveURL(/\/planner$/, { timeout: 15_000 });
  await expect(page.locator(".fc-event").filter({ hasText: "Docker fundamentals" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Continue to Overview" }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByText("Asha Perera").first()).toBeVisible();

  await page.reload();
  await expect(page.getByText("Asha Perera").first()).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/overview$/);

  await page.goto("/settings");
  await page.getByRole("main").getByRole("button", { name: "Demo Reset" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("textbox", { name: "Full name" })).toBeEmpty();
  await expect.poll(() => page.evaluate(() => ({
    state: localStorage.getItem("lumapath-demo-state-v1"),
    onboarding: localStorage.getItem("lumapath-onboarding-v1"),
    assessment: localStorage.getItem("lumapath-baseline-v1"),
  }))).toEqual({ state: null, onboarding: null, assessment: null });
});

test("a returning student can schedule a chosen credential resource", async ({ page }) => {
  const answers = Object.fromEntries(baselineQuestions.map((question) => [
    question.id,
    question.options[question.id === "docker-compose" || ["CI/CD", "Cloud"].includes(question.skill) ? 1 : 0],
  ]));
  await page.addInitScript((savedAnswers) => {
    localStorage.setItem("lumapath-onboarding-v1", JSON.stringify({
      completed: true, name: "Asha Perera", university: "Colombo University", degree: "Computer Science",
      academicYear: "Year 3", semester: "Semester 1", currentModules: "Databases, Networks",
      careerGoal: "DevOps Engineer", weeklyLearningHours: 8, budget: "flexible",
      preferredLearning: ["projects"], language: "English", goal: "certification",
    }));
    localStorage.setItem("lumapath-baseline-v1", JSON.stringify({ answers: savedAnswers }));
  }, answers);
  await page.goto("/career-path/docker/resources");
  const credential = page.getByLabel("Best Credential Option");
  await expect(credential).toBeVisible();
  const resourceTitle = await credential.getByRole("heading").first().innerText();
  await credential.getByRole("button", { name: "Choose This Path" }).click();
  await credential.getByRole("button", { name: "Add to My Plan" }).click();
  await expect(page).toHaveURL(/\/planner$/, { timeout: 15_000 });
  await expect(page.locator(".fc-event").filter({ hasText: resourceTitle }).first()).toBeVisible();
  await page.getByRole("link", { name: "Continue to Overview" }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.reload();
  await expect(page.getByText("Asha Perera").first()).toBeVisible();
  expect(await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("lumapath-demo-state-v1") ?? "null");
    return state && state.scheduledPathBySkill.docker === state.selectedResourceBySkill.docker;
  })).toBe(true);
});
