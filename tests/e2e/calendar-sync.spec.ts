import { expect, test, type Page } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const jsonHeaders = { "content-type": "application/json" };

async function mockNotifications(page: Page) {
  await page.route("**/api/notifications/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/inbox")) {
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ items: [], unread_count: 0, generated_at: "2026-10-02T00:00:00Z", partial: false, calendar_integration_available: true }) });
    }
    if (path.endsWith("/preferences")) {
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({
        student_id: "student-onboarded", timezone: "Asia/Colombo", quiet_hours_enabled: true, quiet_hours_start: "22:00", quiet_hours_end: "07:00",
        mute_non_critical: false, max_non_critical_per_day: 6, max_non_critical_per_hour: 3, in_app_enabled: true,
        push_enabled: false, push_permission_granted: false, email_enabled: false, email_consent: false,
        categories: { deadline:true, risk:true, top_priority:true, missed_work:true, study_session:true, application_date:true, roadmap_milestone:true, calendar_event:true },
        updated_at: "2026-10-02T00:00:00Z", push_provider_available: false, email_provider_available: false,
      }) });
    }
    if (path.endsWith("/candidates/sync")) return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ accepted:0,deduplicated:0,resolved:0,expired:0,delivered:0,suppressed:0,failed:0 }) });
    return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ saved: true }) });
  });
}

async function mockCalendar(page: Page) {
  let committed = false;
  let connection = {
    id: "calconn-e2e",
    source_type: "manual_ics",
    display_name: "academic.ics",
    status: "active",
    default_timezone: "Asia/Colombo",
    scopes: [],
    last_sync_at: null as string | null,
    revoked_at: null,
    created_at: "2026-10-02T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
    provider_connected: false,
  };
  const importedItem = {
    id: "calitem-exam",
    connection_id: "calconn-e2e",
    external_id: "exam-001",
    recurrence_key: "base",
    kind: "exam",
    title: "Database Exam",
    description: "Official examination slot",
    start_at: "2026-10-25T03:30:00Z",
    end_at: "2026-10-25T05:30:00Z",
    timezone: "Asia/Colombo",
    confidence: 0.99,
    source_updated_at: null,
    source_state: "active",
    import_status: "imported",
    mapped_record_type: "planner_event",
    mapped_internal_id: "calendar-event-exam",
    override_fields: [],
    last_sync_at: "2026-10-02T00:01:00Z",
    source_badge: "Calendar · academic.ics",
  };

  await page.route("**/api/calendar/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/api/calendar/sync-history") && request.method() === "GET") {
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ items: committed ? [{
        id: "calsync-e2e", connection_id: connection.id, connection_name: connection.display_name,
        status: "committed", source_filename: "academic.ics", source_format: "ics",
        started_at: "2026-10-02T00:00:30Z", completed_at: "2026-10-02T00:01:00Z", imported: 1, updated: 0, skipped: 0,
      }] : [] }) });
    }
    if (path.endsWith("/api/calendar/connections") && request.method() === "GET") {
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ items: committed ? [{ ...connection, last_sync_at: "2026-10-02T00:01:00Z" }] : [] }) });
    }
    if (path.endsWith("/api/calendar/items") && request.method() === "GET") {
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ items: committed ? [importedItem] : [] }) });
    }
    if (path.endsWith("/api/calendar/imports/preview") && request.method() === "POST") {
      return route.fulfill({ status: 201, headers: jsonHeaders, body: JSON.stringify({
        sync_run_id: "calsync-e2e",
        connection_id: "calconn-e2e",
        connection_name: "academic.ics",
        source_format: "ics",
        timezone: "Asia/Colombo",
        status: "preview_ready",
        items: [{
          preview_key: "exam-001::base", external_id: "exam-001", recurrence_key: "base", kind: "exam", title: "Database Exam",
          description: "Official examination slot", start_at: "2026-10-25T03:30:00Z", end_at: "2026-10-25T05:30:00Z", timezone: "Asia/Colombo",
          confidence: 0.99, source_updated_at: null, change_type: "new", matched_internal_id: null, mapped_record_type: null,
          conflict_internal_ids: [], override_fields: [], source_warning: null, selected_by_default: true,
        }],
        new_count: 1, changed_count: 0, duplicate_count: 0, conflict_count: 0, deleted_count: 0, unchanged_count: 0,
        generated_at: "2026-10-02T00:00:30Z",
      }) });
    }
    if (path.endsWith("/api/calendar/sync-runs/calsync-e2e/commit") && request.method() === "POST") {
      committed = true;
      connection = { ...connection, last_sync_at: "2026-10-02T00:01:00Z" };
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({
        sync_run_id: "calsync-e2e", connection_id: "calconn-e2e", committed: true,
        actions: [{ operation: "create", external_item_id: "calitem-exam", internal_record_id: "calendar-event-exam", record_type: "planner_event", title: "Database Exam", kind: "exam", start_at: "2026-10-25T03:30:00Z", end_at: "2026-10-25T05:30:00Z", due_at: null, source_label: "Calendar · academic.ics", override_fields: [] }],
        imported: 1, updated: 0, linked: 0, skipped: 0, removed: 0, kept_personal: 0, committed_at: "2026-10-02T00:01:00Z",
      }) });
    }
    return route.fulfill({ status: 404, headers: jsonHeaders, body: JSON.stringify({ detail: "Unmocked calendar route" }) });
  });
}

test.beforeEach(async ({ page }) => {
  await seedExistingStudent(page);
  await mockNotifications(page);
  await mockCalendar(page);
});

test("manual iCalendar preview requires review before applying a source-traceable planner event", async ({ page }) => {
  await page.goto("/calendar-sync");
  await expect(page.getByRole("heading", { name: /Calendar Sync|දින දර්ශන|காலண்டர்/i })).toBeVisible();

  await page.getByLabel("Calendar file").setInputFiles({
    name: "academic.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:exam-001\r\nSUMMARY:Database Exam\r\nDTSTART;TZID=Asia/Colombo:20261025T090000\r\nDTEND;TZID=Asia/Colombo:20261025T110000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"),
  });
  await page.getByRole("button", { name: /Preview changes/i }).click();
  await expect(page.getByText("Database Exam", { exact: true })).toBeVisible();
  await expect(page.getByText("New", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Import decision for Database Exam")).toHaveValue("import");

  await page.getByRole("button", { name: /Apply selected changes/i }).click();
  await expect(page.getByText("Calendar · academic.ics", { exact: true })).toBeVisible();

  await page.goto("/planner?date=2026-10-25");
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(page.getByText("Database Exam", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Calendar · academic.ics", { exact: true }).first()).toBeVisible();
});

test("calendar import workspace is keyboard reachable and does not overflow a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/calendar-sync");
  const fileInput = page.getByLabel("Calendar file");
  await fileInput.focus();
  await expect(fileInput).toBeFocused();
  const width = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }));
  expect(width.body).toBeLessThanOrEqual(width.viewport + 1);
});
