import type { DailyFeedResponse, FeedInteractionResponse, FeedView, PlannerHandoff } from "@/features/intelligence/domain/daily-feed";

export class IntelligenceApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "IntelligenceApiError";
  }
}

async function api<T>(path: string, studentId: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const headers = new Headers(init.headers);
    headers.set("X-Luma-Student-Id", studentId);
    if (init.body) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...init, headers, cache: "no-store", signal: controller.signal });
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    if (!response.ok) throw new IntelligenceApiError(body?.detail ?? `Intelligence request failed (${response.status}).`, response.status);
    return body as T;
  } catch (error) {
    if (error instanceof IntelligenceApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new IntelligenceApiError("Daily intelligence timed out. No feed action or planner data was changed.");
    }
    throw new IntelligenceApiError("Daily intelligence is unavailable. Start the LumaPath API and try again.");
  } finally {
    window.clearTimeout(timer);
  }
}

export function loadDailyFeed(studentId: string, view: FeedView): Promise<DailyFeedResponse> {
  return api(`/api/intelligence/feed?view=${encodeURIComponent(view)}`, studentId);
}

export function feedInteraction(studentId: string, articleId: string, action: "save" | "unsave" | "dismiss" | "report", reason = ""): Promise<FeedInteractionResponse> {
  return api(`/api/intelligence/feed/${encodeURIComponent(articleId)}/interactions`, studentId, {
    method: "POST",
    body: JSON.stringify({ action, reason }),
  });
}

export function addFeedItemToPlan(studentId: string, articleId: string, payload: {
  idempotency_key: string;
  preferred_start_at?: string | null;
  duration_minutes?: number | null;
  existing_blocks: { id: string; start_at: string; end_at: string }[];
}): Promise<PlannerHandoff> {
  return api(`/api/intelligence/feed/${encodeURIComponent(articleId)}/add-to-plan`, studentId, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
