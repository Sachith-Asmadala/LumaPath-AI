import type { Page } from "@playwright/test";

export async function seedExistingStudent(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("lumapath-onboarding-v1", JSON.stringify({
      completed: true,
      name: "Sachith",
      university: "Pacific Northwest University",
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
}
