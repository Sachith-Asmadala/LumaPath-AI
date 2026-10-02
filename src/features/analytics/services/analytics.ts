import type { AnalyticsDashboard, AnalyticsDrilldown } from "@/features/analytics/domain/analytics";
import { isAnalyticsDashboard, isAnalyticsDrilldown } from "@/features/analytics/domain/analytics";

export class AnalyticsApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AnalyticsApiError";
  }
}

async function analyticsFetch(path: string, studentId: string, init: RequestInit = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    headers.set("X-Luma-Student-Id", studentId);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...init, cache: "no-store", headers, signal: controller.signal });
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    if (!response.ok) throw new AnalyticsApiError(body?.detail ?? `Analytics request failed (${response.status}).`, response.status);
    return body;
  } catch (error) {
    if (error instanceof AnalyticsApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new AnalyticsApiError("Analytics timed out. Your source data was not changed.");
    throw new AnalyticsApiError("Analytics service is unavailable. Start the LumaPath API and try again.");
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function syncAnalytics(studentId: string, payload: unknown) {
  return analyticsFetch("/api/analytics/sync", studentId, { method: "POST", body: JSON.stringify(payload) });
}

export async function getAnalyticsDashboard(studentId: string, start: string, end: string, timezone = "Asia/Colombo"): Promise<AnalyticsDashboard> {
  const query = new URLSearchParams({ start, end, timezone });
  const body = await analyticsFetch(`/api/analytics/dashboard?${query}`, studentId);
  if (!isAnalyticsDashboard(body)) throw new AnalyticsApiError("Analytics returned an invalid dashboard response.");
  return body;
}

export async function getAnalyticsDrilldown(studentId: string, metric: string, start: string, end: string, timezone = "Asia/Colombo"): Promise<AnalyticsDrilldown> {
  const query = new URLSearchParams({ start, end, timezone });
  const body = await analyticsFetch(`/api/analytics/metrics/${encodeURIComponent(metric)}?${query}`, studentId);
  if (!isAnalyticsDrilldown(body)) throw new AnalyticsApiError("Analytics returned an invalid source response.");
  return body;
}
