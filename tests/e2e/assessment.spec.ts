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
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

  for (let index = 0; index < 12; index += 1) {
    await expect(page.getByText(`Question ${index + 1} of 12`)).toBeVisible();
    const question = page.getByRole("group", { name: baselineQuestions[index].question });
    await expect(question).toBeVisible();
    const choiceIndex = baselineQuestions[index].id === "docker-compose" || ["CI/CD", "Cloud"].includes(baselineQuestions[index].skill) ? 1 : 0;
    await question.getByRole("radio").nth(choiceIndex).press("Space");
    await expect(question.getByRole("radio").nth(choiceIndex)).toBeChecked();
    await page.getByRole("button", { name: index === 11 ? "Submit Assessment" : "Next" }).click();
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
});
