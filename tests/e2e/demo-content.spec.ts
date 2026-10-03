import { expect, test } from "@playwright/test";

test.use({ timezoneId: "Asia/Colombo" });

test("demo restores analyzed CVs, projects, certificate photos, study materials and sync history", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/competition-demo");
  await page.getByRole("button", { name: "Start Competition Demo", exact: true }).click();
  await expect(page).toHaveURL(/\/overview/, { timeout: 45_000 });
  await expect(page.getByAltText("Sachith's profile picture").first()).toBeVisible({ timeout: 20_000 });
  const headers = { "X-Luma-Student-Id": "competition-student" };
  const projectsResponse = await page.request.get("/api/portfolio/projects", { headers });
  expect(projectsResponse.ok()).toBe(true);
  const projects = (await projectsResponse.json()).items;
  expect(projects).toHaveLength(3);
  expect(projects.every((project: { latest_analysis: unknown }) => project.latest_analysis)).toBe(true);
  await page.goto("/portfolio");
  await expect(page.getByText("GitHub Release Automation", { exact: true }).first()).toBeVisible();
  await page.goto("/cv");
  await expect(page.getByRole("button", { name: /DevOps Starter CV \(Demo\)/ })).toBeVisible();
  await page.getByRole("button", { name: /DevOps Internship CV \(Demo\)/ }).click();
  await expect(page.getByRole("heading", { name: "Findings and actions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Role evidence map" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Internship CV · PDF", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("devops-internship.pdf");
  await page.goto("/evidence");
  for (const title of ["Git & Release Automation · Sample certificate", "Docker Foundations · Sample certificate"]) {
    const photo = page.getByAltText(title, { exact: true });
    await photo.scrollIntoViewIfNeeded();
    await expect(photo).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => photo.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
  }
  await page.goto("/documents");
  await expect(page.getByText("linux-foundations.pdf", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("docker-networking-lab.pdf", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("cicd-release-guide.txt", { exact: true }).first()).toBeVisible();
  await page.goto("/calendar-sync");
  await expect(page.getByRole("heading", { name: "Sync history", exact: true })).toBeVisible();
  await expect(page.getByText("3 imported · 0 updated · 0 skipped", { exact: true })).toBeVisible();
  await expect(page.getByText("0 imported · 0 updated · 3 skipped", { exact: true })).toBeVisible();
  await expect(page.getByText("Software Engineering lecture", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/evidence");
  await expect(page.getByAltText("Docker Foundations · Sample certificate")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator("#workspace-main [role=alert]")).toHaveCount(0);
});
