import { apiErrorMessage, demoStudentHeaders } from "@/features/subscriptions/entitlements";
import {
  isCohortList,
  isGovernance,
  isInstitutionalDashboard,
  isMetricDefinitionList,
  type CohortSummary,
  type Governance,
  type InstitutionalDashboard,
  type MetricDefinition,
} from "@/features/institutional-analytics/domain/institutional-analytics";

export class InstitutionalAnalyticsApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "InstitutionalAnalyticsApiError";
  }
}

async function requestJson(path: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, { ...init, cache: "no-store", headers: { ...demoStudentHeaders(), ...init.headers }, signal: controller.signal });
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    if (!response.ok) throw new InstitutionalAnalyticsApiError(apiErrorMessage(body, `Institutional analytics request failed (${response.status}).`), response.status);
    return body;
  } catch (error) {
    if (error instanceof InstitutionalAnalyticsApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new InstitutionalAnalyticsApiError("Institutional analytics timed out. No data was changed.");
    throw new InstitutionalAnalyticsApiError("Institutional analytics is unavailable. Start the LumaPath API and try again.");
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getInstitutionalCohorts(): Promise<CohortSummary[]> {
  const body = await requestJson("/api/institutional-analytics/cohorts");
  if (!isCohortList(body)) throw new InstitutionalAnalyticsApiError("Institutional analytics returned an invalid cohort catalogue.");
  return body;
}

export async function getInstitutionalDashboard(cohortId: string, start: string, end: string, timezone = "Asia/Colombo"): Promise<InstitutionalDashboard> {
  const query = new URLSearchParams({ cohort_id: cohortId, start, end, timezone });
  const body = await requestJson(`/api/institutional-analytics/dashboard?${query}`);
  if (!isInstitutionalDashboard(body)) throw new InstitutionalAnalyticsApiError("Institutional analytics returned an invalid dashboard response.");
  return body;
}

export async function refreshInstitutionalDashboard(cohortId: string, start: string, end: string, timezone = "Asia/Colombo") {
  const query = new URLSearchParams({ start, end, timezone });
  return requestJson(`/api/institutional-analytics/cohorts/${encodeURIComponent(cohortId)}/refresh?${query}`, { method: "POST" });
}

export async function getMetricDefinitions(): Promise<MetricDefinition[]> {
  const body = await requestJson("/api/institutional-analytics/definitions");
  if (!isMetricDefinitionList(body)) throw new InstitutionalAnalyticsApiError("Metric definitions response is invalid.");
  return body;
}

export async function getInstitutionalGovernance(): Promise<Governance> {
  const body = await requestJson("/api/institutional-analytics/governance");
  if (!isGovernance(body)) throw new InstitutionalAnalyticsApiError("Analytics governance response is invalid.");
  return body;
}

export async function downloadInstitutionalExport(cohortId: string, start: string, end: string, timezone = "Asia/Colombo") {
  const query = new URLSearchParams({ cohort_id: cohortId, start, end, timezone });
  const response = await fetch(`/api/institutional-analytics/export?${query}`, { cache: "no-store", headers: demoStudentHeaders() });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new InstitutionalAnalyticsApiError(apiErrorMessage(body, "Aggregate export failed."), response.status);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/i);
  return { blob, filename: match?.[1] ?? `lumapath-${cohortId}-aggregate.csv` };
}
