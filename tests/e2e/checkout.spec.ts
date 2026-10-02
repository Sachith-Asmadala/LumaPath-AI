import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

test.use({ timezoneId: "Asia/Colombo" });

async function mockSubscription(page: import("@playwright/test").Page, failActivation = false) {
  let plan = "free";
  const requests: unknown[] = [];
  await page.route("**/api/subscriptions/**", async (route) => {
    const request = route.request();
    const subject = request.headers()["x-luma-student-id"];
    if (request.url().endsWith("/demo-plan")) {
      requests.push(request.postDataJSON());
      if (failActivation) { await route.fulfill({ status: 503, json: { detail: "Plan activation is temporarily unavailable. Please try again." } }); return; }
      plan = request.postDataJSON().plan;
    }
    await route.fulfill({ json: { subject_id: subject, plan, name: plan === "pro" ? "LumaPath Pro" : "LumaPath Free", entitlements: {}, demo_switch_enabled: true, billing_connected: false, period_timezone: "UTC" } });
  });
  return requests;
}

test("checkout activates Pro, sends no card data, and provides a demo receipt", async ({ page }) => {
  await seedExistingStudent(page);
  const activationRequests = await mockSubscription(page);
  await page.goto("/pricing");
  await page.getByRole("link", { name: "Upgrade to Pro", exact: true }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole("heading", { name: "Complete your upgrade" })).toBeVisible();
  await page.getByRole("button", { name: "Use demo card" }).click();
  await page.getByRole("button", { name: "Activate Pro · $4.99 / month" }).click();
  await expect(page.getByRole("heading", { name: "You’re on Pro." })).toBeVisible();
  expect(activationRequests).toEqual([{ plan: "pro" }]);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("4242");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF receipt" }).click();
  const receiptDownload = await download;
  expect(receiptDownload.suggestedFilename()).toMatch(/^lumapath-demo-.*\.pdf$/);
  const file = await readFile((await receiptDownload.path())!);
  expect(file.subarray(0, 5).toString()).toBe("%PDF-");
  const receiptPdf = await PDFDocument.load(file);
  expect(receiptPdf.getPageCount()).toBe(1);
  expect(receiptPdf.getTitle()).toMatch(/^LumaPath Pro demo receipt DEMO-/);
  expect(receiptPdf.getSubject()).toContain("No payment collected");
  await page.getByRole("link", { name: "Explore my Pro workspace" }).click();
  await page.goto("/pricing");
  await expect(page.locator(".membership-plus").getByText("CURRENT PLAN", { exact: true })).toBeVisible();
});

test("validates details and annual totals on a narrow screen", async ({ page }) => {
  await seedExistingStudent(page);
  const activationRequests = await mockSubscription(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/checkout");
  await page.getByRole("button", { name: "Activate Pro · $4.99 / month" }).click();
  await expect(page.getByText("Enter a valid email address.", { exact: true })).toBeVisible();
  expect(activationRequests).toHaveLength(0);
  await page.getByRole("radio", { name: /Annual/ }).check();
  await expect(page.getByRole("button", { name: "Activate Pro · $47.90 / year" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Use demo card" }).click();
  await page.getByLabel("Card number", { exact: true }).fill("5555 5555 5555 4444");
  await page.getByRole("button", { name: "Activate Pro · $47.90 / year" }).click();
  await expect(page.getByText("Use the demo card: 4242 4242 4242 4242.", { exact: true })).toBeVisible();
  expect(activationRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Use demo card" }).click();
  await page.getByLabel("Cardholder name", { exact: true }).fill("සචිත් පෙරේරා");
  await page.getByRole("button", { name: "Activate Pro · $47.90 / year" }).click();
  await expect(page.getByRole("region", { name: "Demo receipt" })).toContainText("$47.90 USD");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF receipt" }).click();
  const pdf = await PDFDocument.load(await readFile((await (await download).path())!));
  expect(pdf.getPageCount()).toBe(1);
});

test("an activation failure keeps checkout open and allows a retry", async ({ page }) => {
  await seedExistingStudent(page);
  const activationRequests = await mockSubscription(page, true);
  await page.goto("/checkout");
  await page.getByRole("button", { name: "Use demo card" }).click();
  await page.getByRole("button", { name: "Activate Pro · $4.99 / month" }).click();
  await expect(page.getByText("Plan activation is temporarily unavailable. Please try again.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "You’re on Pro." })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Activate Pro · $4.99 / month" })).toBeEnabled();
  expect(activationRequests).toEqual([{ plan: "pro" }]);
});
