import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const headers = { "content-type": "application/json" };

function readyDocument() {
  return {
    id: "doc-test",
    owner_id: "student-onboarded",
    original_name: "database-week4.txt",
    kind: "notes",
    mime_type: "text/plain",
    size_bytes: 180,
    sha256: "abc",
    status: "ready",
    scan_status: "unavailable",
    module_id: "module-database-systems",
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:02Z",
    retention_expires_at: "2026-10-31T10:00:00Z",
    processing_attempts: 1,
    error_code: null,
    error_message: null,
    duplicate: false,
    analysis: {
      summary: "Indexes improve lookup performance and the assignment includes a date that still requires confirmation.",
      summary_source_refs: [{ chunk_id: "chunk-1", locator_type: "section", locator: "Section 1" }],
      learning_outcomes: [{ id: "out-1", text: "Explain database indexing trade-offs.", source_refs: [{ chunk_id: "chunk-1", locator_type: "section", locator: "Section 1" }], derived: false }],
      dates: [{ id: "date-1", label: "Possible deadline", raw_text: "Assignment due 2026-10-10", normalized_date: "2026-10-10T00:00:00", confidence: 0.88, official_status: "unconfirmed", requires_confirmation: true, source_refs: [{ chunk_id: "chunk-1", locator_type: "section", locator: "Section 1" }] }],
      study_time_minutes: 45,
      study_time_rationale: "Estimated from the extracted words plus active recall.",
      flashcards: [{ id: "card-1", front: "What is an index?", back: "A structure that can improve lookup performance.", source_refs: [{ chunk_id: "chunk-1", locator_type: "section", locator: "Section 1" }] }],
      quiz: [{ id: "quiz-1", prompt: "What is an index?", choices: ["A lookup structure", "A network protocol"], answer_index: 0, explanation: "Grounded in Section 1.", source_refs: [{ chunk_id: "chunk-1", locator_type: "section", locator: "Section 1" }] }],
      proposed_actions: [
        { id: "act-plan", kind: "plan_item", title: "Study database-week4.txt", description: "Review the uploaded material.", estimated_minutes: 45, start_at: null, due_at: null, category: "Academic", date_confirmed: false, source_refs: [{ chunk_id: "chunk-1", locator_type: "section", locator: "Section 1" }], flashcards: [], quiz: [] },
        { id: "act-task", kind: "task", title: "Review possible deadline from database-week4.txt", description: "Assignment due 2026-10-10", estimated_minutes: 30, start_at: null, due_at: "2026-10-10T00:00:00", category: "Academic", date_confirmed: false, source_refs: [{ chunk_id: "chunk-1", locator_type: "section", locator: "Section 1" }], flashcards: [], quiz: [] },
        { id: "act-cards", kind: "flashcard_set", title: "Flashcards · database-week4.txt", description: "Editable flashcards", estimated_minutes: null, start_at: null, due_at: null, category: "Academic", date_confirmed: false, source_refs: [{ chunk_id: "chunk-1", locator_type: "section", locator: "Section 1" }], flashcards: [{ id: "card-1", front: "What is an index?", back: "A structure that can improve lookup performance.", source_refs: [{ chunk_id: "chunk-1", locator_type: "section", locator: "Section 1" }] }], quiz: [] },
        { id: "act-quiz", kind: "quiz_set", title: "Quiz · database-week4.txt", description: "Editable quiz", estimated_minutes: null, start_at: null, due_at: null, category: "Academic", date_confirmed: false, source_refs: [{ chunk_id: "chunk-1", locator_type: "section", locator: "Section 1" }], flashcards: [], quiz: [{ id: "quiz-1", prompt: "What is an index?", choices: ["A lookup structure", "A network protocol"], answer_index: 0, explanation: "Grounded in Section 1.", source_refs: [{ chunk_id: "chunk-1", locator_type: "section", locator: "Section 1" }] }] },
      ],
      warnings: ["Dates extracted from documents are unconfirmed until you review them; LumaPath does not treat them as official automatically."],
    },
  };
}

test.beforeEach(async ({ page }) => {
  await seedExistingStudent(page);
  let uploaded = false;
  let polls = 0;
  await page.route("**/api/documents**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/documents") {
      uploaded = true;
      return route.fulfill({ status: 202, headers, body: JSON.stringify({ ...readyDocument(), status: "queued", analysis: null, processing_attempts: 0 }) });
    }
    if (request.method() === "GET" && url.pathname === "/api/documents") {
      if (!uploaded) return route.fulfill({ status: 200, headers, body: JSON.stringify({ items: [] }) });
      polls += 1;
      const item = polls > 1 ? readyDocument() : { ...readyDocument(), status: "processing", analysis: null };
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ items: [item] }) });
    }
    if (request.method() === "POST" && url.pathname.endsWith("/actions/approve")) {
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ saved: true, action_id: "saved", kind: "task", message: "saved" }) });
    }
    if (request.method() === "DELETE") return route.fulfill({ status: 200, headers, body: JSON.stringify({ deleted: true, document_id: "doc-test" }) });
    return route.continue();
  });
});

test("student uploads, reviews grounded results, edits study tools and explicitly approves a planner action", async ({ page }) => {
  await page.goto("/documents");
  await expect(page.getByRole("heading", { name: "Turn course files into study actions" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({ name: "database-week4.txt", mimeType: "text/plain", buffer: Buffer.from("An index is a lookup structure. Assignment due 2026-10-10.") });
  await page.getByRole("button", { name: "Upload & process" }).click();
  await expect(page.getByText("Processing", { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Grounded summary")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("Section 1").first()).toBeVisible();
  await expect(page.getByText(/unconfirmed until you review/)).toBeVisible();

  await page.getByRole("tab", { name: "Flashcards" }).click();
  await page.getByLabel("Flashcard 1 front").fill("Why can an index improve lookup speed?");
  await page.getByRole("button", { name: "Approve flashcards" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();

  await page.getByRole("tab", { name: "Dates & actions" }).click();
  await page.getByLabel(/Planner start for Review possible deadline/).fill("2026-10-02T14:00");
  await page.getByLabel(/confirm this extracted date/i).check();
  await page.getByRole("button", { name: "Approve & save" }).nth(1).click();
  await expect(page.getByRole("button", { name: "Saved" }).last()).toBeDisabled();

  await page.getByRole("link", { name: "Planner", exact: true }).click();
  await expect(page.getByText("Review possible deadline from database-week4.txt", { exact: true })).toBeVisible();
});
