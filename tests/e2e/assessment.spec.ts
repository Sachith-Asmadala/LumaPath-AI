import { expect, test } from "@playwright/test";
import { baselineQuestions } from "../../src/lib/domain/baseline-assessment";

test("DevOps assessment saves weighted baseline scores and survives refresh", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("lumapath-onboarding-v1", JSON.stringify({
      completed: true,
      name: "Test Student",
      university: "Example University",
      degree: "Computer Science",
      academicYear: "Year 3",
      semester: "Semester 1",
      currentModules: "Networks, Software Engineering",
      careerGoal: "DevOps Engineer",
      weeklyLearningHours: 6,
      budget: "free only",
      preferredLearning: ["hands-on"],
      language: "English",
      goal: "internship",
    }));
  });
  await page.goto("/assessment");
  await expect(page.getByText("Question 1 of 12")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();

  for (let index = 0; index < 12; index += 1) {
    await expect(page.getByText(`Question ${index + 1} of 12`)).toBeVisible();
    const question = page.getByRole("group", { name: baselineQuestions[index].question });
    await expect(question).toBeVisible();
    const choiceIndex = baselineQuestions[index].id === "docker-compose" || ["CI/CD", "Cloud"].includes(baselineQuestions[index].skill) ? 1 : 0;
    await question.getByRole("radio").nth(choiceIndex).press("Space");
    await expect(question.getByRole("radio").nth(choiceIndex)).toBeChecked();
    await page.getByRole("button", { name: index === 11 ? "Submit Assessment" : "Next", exact: true }).click();
  }

  await expect(page).toHaveURL(/\/assessment\/results$/);
  await expect(page.getByRole("heading", { name: "Your DevOps baseline" })).toBeVisible();
  await expect(page.getByText("Skill breakdown")).toBeVisible();
  await expect(page.getByText("Overall DevOps Baseline")).toBeVisible();
  await expect(page.getByText("Recommended Next Skill")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Docker" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Build My Learning Path" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your DevOps baseline" })).toBeVisible();
  await page.getByRole("link", { name: "Build My Learning Path" }).click();
  await expect(page).toHaveURL(/\/career-path$/);
  const docker = page.locator(".react-flow__node").filter({ has: page.getByRole("heading", { name: "Docker", exact: true }) });
  await expect(docker.getByText("Recommended next")).toBeVisible();
  await expect(docker.getByText("33%")).toBeVisible();
  await expect(docker.getByText("75%")).toBeVisible();
  await expect(docker.getByText("2 weeks")).toBeVisible();
  await expect(docker.getByText("CI/CD")).toBeVisible();
  await docker.getByRole("link", { name: "Find Learning Resources" }).click();
  await expect(page).toHaveURL(/\/career-path\/docker\/resources$/);
  await expect(page.getByRole("heading", { name: "Find learning resources for Docker" })).toBeVisible();
  await expect(page.getByText("Best Overall")).toBeVisible();
  await expect(page.getByText("Best Free/Open Learning Path")).toBeVisible();
  await expect(page.getByText("No certificate option in the local catalog fits your current filters.")).toBeVisible();
  await page.getByRole("button", { name: "Choose This Path" }).first().click();
  await expect(page.getByText("Your chosen Docker path is saved in this demo session.")).toBeVisible();
  await page.getByRole("link", { name: "View Free Learning Path" }).click();
  await expect(page).toHaveURL(/\/career-path\/docker\/free-path$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Docker Open Learning Path" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Docker free learning steps" }).getByRole("listitem")).toHaveCount(7);
  await expect(page.getByRole("heading", { name: "LumaPath skill verification" })).toBeVisible();
  await page.getByRole("button", { name: "Add Free Path to My Plan" }).click();
  await expect(page.getByText("The free path is saved in your learning plan. No calendar blocks were added.")).toBeVisible();
  await page.getByRole("button", { name: "Add to My Plan" }).click();
  await expect(page).toHaveURL(/\/planner$/);
  await expect(page.locator(".fc-event").filter({ hasText: "Docker fundamentals" }).first()).toBeVisible();
  await expect(page.getByText("Academic deadlines protected").first()).toBeVisible();
  await page.goBack();
  await page.getByRole("main").getByRole("link", { name: "Learning Resources" }).click();
  await expect(page.getByText("Your structured $0 Docker path is in your learning plan.")).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Career Path" }).click();
  await expect(page.getByText("Free path added").first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const mobileRoadmap = page.getByRole("list", { name: "DevOps career pathway" });
  await expect(mobileRoadmap.getByRole("heading", { name: "Networking" })).toBeVisible();
  await expect(mobileRoadmap.getByRole("heading", { name: "Docker" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
