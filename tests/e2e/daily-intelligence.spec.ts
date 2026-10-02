import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const jsonHeaders = { "content-type": "application/json" };

const baseItem = {
  recommendation_id: "rec-demo-1",
  article_id: "article-demo-1",
  category: "learning_article",
  category_label: "Learning article",
  title: "Trusted Docker networking update",
  excerpt: "Permitted metadata excerpt from an approved source.",
  canonical_url: "https://docs.docker.com/get-started/",
  source: { id: "docker-official", name: "Docker Official", source_type: "official_vendor", trust_score: 98, terms_url: "https://www.docker.com/legal/" },
  published_at: "2026-10-02T02:00:00Z",
  expires_at: "2026-11-16T02:00:00Z",
  fresh: true,
  topics: ["devops", "docker"],
  skills: ["docker"],
  difficulty: "intermediate",
  reading_minutes: 18,
  relevance_score: 96.2,
  why_this_matters: "This matters because Docker is your current pathway step, and the intermediate difficulty fits your current learning stage, and the source is approved with a 98/100 trust score.",
  ranking_version: "2026-10-doc-f30-rank-v1",
  explanation_version: "2026-10-doc-f30-explain-v1",
  interaction_state: "new",
};

function feed(items: typeof baseItem[], state = "ready", message = "Fresh, approved-source updates ranked for your current pathway.") {
  return {
    state,
    message,
    feed_date: "2026-10-02",
    generated_at: "2026-10-02T04:00:00Z",
    pathway: { pathway_id: "path-demo", pathway_version: 1, target_role: "DevOps Engineer", current_step: { id: "step-docker", skill_id: "docker", name: "Docker", state: "in_progress", proficiency: 52 } },
    ingestion: { state: "healthy", last_success_at: "2026-10-02T03:00:00Z", last_attempt_at: "2026-10-02T03:00:00Z", failed_sources: 0, message: "Approved-source ingestion is healthy." },
    items,
    freshness_policy: "Only unexpired metadata from approved sources can appear in today's feed.",
  };
}

test.beforeEach(async ({ page }) => {
  await seedExistingStudent(page);
});

test("student can inspect relevance, save an update and approve a planner handoff", async ({ page }) => {
  let saved = false;
  let planned = false;
  let dismissed = false;

  await page.route("**/api/intelligence/feed**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "POST" && path.endsWith("/interactions")) {
      const body = request.postDataJSON() as { action: string };
      if (body.action === "save") saved = true;
      if (body.action === "unsave") saved = false;
      if (body.action === "dismiss") dismissed = true;
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ article_id: baseItem.article_id, action: body.action, state: body.action === "save" ? "saved" : body.action === "dismiss" ? "dismissed" : "new", feed_invalidated: true, message: "Feed action saved." }) });
    }
    if (request.method() === "POST" && path.endsWith("/add-to-plan")) {
      planned = true;
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ article_id: baseItem.article_id, recommendation_id: baseItem.recommendation_id, title: `Review · ${baseItem.title}`, start_at: "2026-10-03T13:30:00Z", end_at: "2026-10-03T14:00:00Z", duration_minutes: 30, category: "Career", description: `Approved-source study task from ${baseItem.source.name}. ${baseItem.why_this_matters}`, source: baseItem.source.name, source_url: baseItem.canonical_url, ranking_version: baseItem.ranking_version, explanation_version: baseItem.explanation_version, idempotent: false }) });
    }
    if (request.method() === "GET" && path === "/api/intelligence/feed") {
      const view = url.searchParams.get("view") ?? "today";
      const visible = dismissed ? [] : view === "saved" ? (saved ? [{ ...baseItem, interaction_state: planned ? "planned" : "saved" }] : []) : view === "planned" ? (planned ? [{ ...baseItem, interaction_state: "planned" }] : []) : [{ ...baseItem, interaction_state: planned ? "planned" : saved ? "saved" : "new" }];
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify(feed(visible)) });
    }
    return route.continue();
  });

  await page.goto("/intelligence");
  await expect(page.getByRole("heading", { name: "What’s relevant to your path" })).toBeVisible();
  await expect(page.getByText(baseItem.title)).toBeVisible();
  await expect(page.getByText(/Docker Official · 98\/100/)).toBeVisible();
  await expect(page.getByText(/Docker is your current pathway step/)).toBeVisible();
  await expect(page.getByText(/Published/)).toBeVisible();

  await page.getByRole("button", { name: `Save ${baseItem.title}` }).click();
  await expect(page.getByRole("button", { name: `Unsave ${baseItem.title}` })).toBeVisible();

  await page.getByRole("button", { name: "Add to Plan" }).click();
  await expect(page.getByRole("link", { name: "Open Planner" })).toBeVisible();

  await page.getByRole("button", { name: "Saved" }).click();
  await expect(page.getByText(baseItem.title)).toBeVisible();
});

test("reported content is explained and removed from the feed", async ({ page }) => {
  let reported = false;
  await page.route("**/api/intelligence/feed**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname.endsWith("/interactions")) {
      const body = request.postDataJSON() as { action: string; reason: string };
      if (body.action === "report") { expect(body.reason.length).toBeGreaterThan(2); reported = true; }
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ article_id: baseItem.article_id, action: body.action, state: "reported", feed_invalidated: true, message: "Reported and quarantined from feeds pending review." }) });
    }
    if (request.method() === "GET" && url.pathname === "/api/intelligence/feed") {
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify(feed(reported ? [] : [baseItem], reported ? "no_fresh_content" : "ready", reported ? "There are no fresh trusted updates for your pathway today." : undefined)) });
    }
    return route.continue();
  });

  await page.goto("/intelligence");
  await page.getByRole("button", { name: `Report ${baseItem.title}` }).click();
  await expect(page.getByRole("dialog")).toContainText("quarantined for review");
  await page.getByRole("textbox", { name: "Report reason" }).fill("The source metadata appears incorrect.");
  await page.getByRole("button", { name: "Report and quarantine" }).click();
  await expect(page.getByText("No fresh trusted updates today")).toBeVisible();
});

test("no-pathway state is explicit and does not fabricate generic updates", async ({ page }) => {
  await page.route("**/api/intelligence/feed?view=today", (route) => route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ ...feed([], "no_pathway", "Create and approve a Career Path before LumaPath ranks daily updates. No generic or fabricated feed is substituted."), pathway: null }) }));
  await page.goto("/intelligence");
  await expect(page.getByText("Your pathway comes first")).toBeVisible();
  await expect(page.getByText(/No generic or fabricated feed/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Career Path" })).toBeVisible();
});
