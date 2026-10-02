import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const headers = { "content-type": "application/json" };
const prefs = {
  student_id:"student-onboarded",timezone:"Asia/Colombo",quiet_hours_enabled:true,quiet_hours_start:"22:00",quiet_hours_end:"07:00",mute_non_critical:false,
  max_non_critical_per_day:6,max_non_critical_per_hour:3,in_app_enabled:true,push_enabled:false,push_permission_granted:false,email_enabled:false,email_consent:false,
  categories:{deadline:true,risk:true,top_priority:true,missed_work:true,study_session:true,application_date:true,roadmap_milestone:true,calendar_event:true},updated_at:"2026-10-02T00:00:00Z",push_provider_available:false,email_provider_available:false,
};

async function mockNotifications(page: import("@playwright/test").Page) {
  let opened=false;
  await page.route("**/api/notifications/**", async route=>{
    const req=route.request(), url=new URL(req.url());
    if(url.pathname.endsWith("/preferences")) return route.fulfill({status:200,headers,body:JSON.stringify(prefs)});
    if(url.pathname.endsWith("/candidates/sync")) return route.fulfill({status:200,headers,body:JSON.stringify({accepted:1,deduplicated:0,resolved:0,expired:0,delivered:1,suppressed:0,failed:0})});
    if(url.pathname.endsWith("/inbox")) return route.fulfill({status:200,headers,body:JSON.stringify({items:[{id:"n1",delivery_id:"d1",notification_type:"deadline",urgency:"high",title:"Deadline approaching",description:"Database assignment · Due within 24 hours.",reason:"Due within 24 hours.",action_href:"/tasks?task=database-assignment",source_type:"task",source_id:"database-assignment",created_at:"2026-10-02T00:00:00Z",delivered_at:"2026-10-02T00:00:00Z",expires_at:"2026-10-03T00:00:00Z",opened_at:opened?"2026-10-02T00:01:00Z":null,dismissed_at:null,acted_at:null}],unread_count:opened?0:1,generated_at:"2026-10-02T00:00:00Z",partial:true,calendar_integration_available:false})});
    if(url.pathname.endsWith("/opened")||url.pathname.endsWith("/acted")){opened=true;return route.fulfill({status:200,headers,body:JSON.stringify({saved:true})});}
    if(url.pathname.endsWith("/dismissed")) return route.fulfill({status:200,headers,body:JSON.stringify({saved:true})});
    return route.continue();
  });
}

test.beforeEach(async ({page})=>{await seedExistingStudent(page);await mockNotifications(page);});

test("notification inbox and preferences remain keyboard accessible", async ({ page }) => {
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: /Notifications|දැනුම්දීම්|அறிவிப்புகள்/i })).toBeVisible();
  await expect(page.getByText("Due within 24 hours.",{exact:true})).toBeVisible();
  const adjust = page.getByRole("link", { name: /Adjust alerts|Alerts සකසන්න|Alerts அமைக்கவும்/i }).first();
  await adjust.focus(); await expect(adjust).toBeFocused(); await adjust.press("Enter");
  await expect(page).toHaveURL(/\/settings/); await expect(page.locator("#notification-preferences")).toBeVisible();
});

test("notification workspace does not overflow a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto("/notifications");
  const width = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }));
  expect(width.body).toBeLessThanOrEqual(width.viewport + 1);
});
