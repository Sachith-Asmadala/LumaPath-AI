import { expect, test } from "@playwright/test";
import { dockerReassessmentQuestions } from "../../src/features/career/domain/skill-reassessment";
import { baselineQuestions } from "../../src/features/assessment/domain/baseline-assessment";

test("a new student reaches Overview through the free DevOps path and can reset the whole journey", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("link", { name: "Find my path", exact: true }).click();
  await page.getByRole("button", { name: "Continue without an account" }).click();
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
  await page.getByRole("link", { name: "Continue your journey", exact: true }).first().click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/overview$/);

  await page.goto("/learning?skill=docker");
  await expect(page.getByRole("heading", { name: "Your learning, connected" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create completion record" })).toBeDisabled();
  while (await page.getByRole("button", { name: "Mark stage complete", exact: true }).count()) {
    await page.getByRole("button", { name: "Mark stage complete", exact: true }).first().click();
  }
  await page.getByLabel("Project link").fill("https://github.com/student/docker-project");
  await page.getByRole("button", { name: "Save project evidence" }).click();
  await expect(page.getByRole("link", { name: "View submitted project" })).toBeVisible();
  await page.getByRole("link", { name: "Verify My Skill", exact: true }).click();
  for (let index = 0; index < dockerReassessmentQuestions.length; index += 1) {
    await page.getByRole("radio").first().click();
    await page.getByRole("button", { name: index === dockerReassessmentQuestions.length - 1 ? /Submit/ : "Next", exact: index !== dockerReassessmentQuestions.length - 1 }).click();
  }
  await expect(page.getByRole("heading", { name: "Docker Verified", exact: true }).first()).toBeVisible();
  await page.goto("/learning?skill=docker");
  await page.getByRole("button", { name: "Create completion record" }).click();
  await page.getByRole("link", { name: "View earned record" }).click();
  await expect(page.getByText("LumaPath local completion record", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download completion record" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await page.goto("/learning?view=history");
  await expect(page.getByRole("heading", { name: "Docker knowledge check" })).toBeVisible();

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

test("an unfinished onboarding resumes at its saved step", async ({ page }) => {
  await page.goto("/onboarding");
  await page.getByLabel("Full name").fill("Nila Silva");
  await page.getByLabel("University", { exact: true }).fill("Demo University");
  await page.getByLabel("Degree", { exact: true }).fill("Computing");
  await page.getByLabel("Academic year").selectOption("Year 2");
  await page.getByLabel("Semester", { exact: true }).selectOption("Semester 1");
  await page.getByLabel("Current modules").fill("Networks");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("radio", { name: /DevOps Engineer/ })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Full name")).toHaveValue("Nila Silva");
});
