import { expect, test } from "@playwright/test";
import { createDemoState } from "../../src/data/demo/seed";
import { seedExistingStudent } from "./seed-existing-student";

test.use({ timezoneId: "Asia/Colombo" });

for (const viewport of [{ width: 1366, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
  test(`timetable contains long labels and separates concurrent events at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedExistingStudent(page);
    await page.route("**/api/profile/locale", route => route.fulfill({ json: { locale: "en" } }));
    const state = createDemoState();
    state.onboarding.completed = true;
    state.onboarding.name = "Sachith";
    state.planBlocks = [
      { id: "lecture", title: "Software Engineering lecture and architecture review", startAt: "2026-10-05T09:00:00+05:30", endAt: "2026-10-05T10:00:00+05:30" },
      { id: "workshop", title: "Docker networking workshop with a very long project name", startAt: "2026-10-05T09:15:00+05:30", endAt: "2026-10-05T10:00:00+05:30" },
      { id: "review", title: "Portfolio review session and certificate evidence", startAt: "2026-10-05T10:00:00+05:30", endAt: "2026-10-05T10:30:00+05:30" },
      { id: "short", title: "Brief planning check-in", startAt: "2026-10-05T10:30:00+05:30", endAt: "2026-10-05T10:45:00+05:30" },
    ].map(block => ({ ...block, taskId: null, category: "Academic", isFixed: true }));
    await page.addInitScript(state => localStorage.setItem("lumapath-demo-state-v1", JSON.stringify(state)), state);
    await page.goto("/planner?date=2026-10-05");
    await expect(page.locator(".fc-timegrid-event")).toHaveCount(4);
    await expect.poll(() => page.evaluate(() => {
      const events = [...document.querySelectorAll<HTMLElement>(".fc-timegrid-event")];
      return events.every(event => {
        const box = event.getBoundingClientRect();
        const content = event.querySelector(".planner-event-inner")!.getBoundingClientRect();
        return content.left >= box.left && content.right <= box.right + 1 && content.top >= box.top && content.bottom <= box.bottom + 1;
      });
    })).toBe(true);
    const concurrent = await page.locator(".fc-timegrid-event").filter({ hasText: /Software Engineering|Docker networking/ }).evaluateAll(events => events.map(event => event.getBoundingClientRect().toJSON()));
    expect(concurrent).toHaveLength(2);
    expect(concurrent[0].right <= concurrent[1].left + 1 || concurrent[1].right <= concurrent[0].left + 1).toBe(true);
    await expect.poll(() => page.evaluate(() => {
      const headers = [...document.querySelectorAll<HTMLElement>(".fc-col-header-cell")];
      return headers.every(header => {
        const column = document.querySelector<HTMLElement>(`.fc-timegrid-col[data-date="${header.dataset.date}"]`)!;
        return Math.abs(header.getBoundingClientRect().left - column.getBoundingClientRect().left) < 1;
      });
    })).toBe(true);
    await expect(page.locator(".fc-timegrid-event-short")).not.toHaveCount(0);
    await expect(page.locator('.fc-timegrid-event[title^="Brief planning check-in"]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width >= 1024) {
      await page.getByRole("button", { name: "Month", exact: true }).click();
      await expect(page.getByRole("heading", { name: "October 2026", exact: true })).toBeVisible();
      await expect(page.locator(".fc-daygrid-event")).toHaveCount(4);
      expect(await page.locator(".fc-daygrid-event").evaluateAll(events => events.every(event => event.scrollWidth <= event.clientWidth + 1))).toBe(true);
    }
  });
}
