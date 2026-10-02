import { apiErrorMessage, demoStudentHeaders } from "@/features/subscriptions/entitlements";
import type { ChangeProposal, MarketGovernance, MarketSource, ProfileComparison, SkillSignal, StudentTaxonomyUpdate, TaxonomyVersion } from "@/features/market-taxonomy/domain/market-taxonomy";

export class MarketTaxonomyApiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "MarketTaxonomyApiError"; }
}

async function jsonRequest<T>(path: string, studentId?: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(path, { ...init, cache: "no-store", signal: controller.signal, headers: { ...demoStudentHeaders(), ...(studentId ? { "X-Luma-Student-Id": studentId } : {}), ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
    const body = await response.json().catch(() => null) as { detail?: string } | T | null;
    if (!response.ok) throw new MarketTaxonomyApiError(apiErrorMessage(body, `Market taxonomy request failed (${response.status}).`), response.status);
    return body as T;
  } catch (error) {
    if (error instanceof MarketTaxonomyApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new MarketTaxonomyApiError("Market taxonomy request timed out. No pathway state was changed.");
    throw new MarketTaxonomyApiError("Market taxonomy is unavailable. No pathway state was changed.");
  } finally { window.clearTimeout(timeout); }
}

export const getProfileComparison = (studentId: string, roleId: string, regionCode?: string) => jsonRequest<ProfileComparison>(`/api/market-taxonomy/student/profile-comparison/${encodeURIComponent(roleId)}${regionCode ? `?region_code=${encodeURIComponent(regionCode)}` : ""}`, studentId);
export const getStudentTaxonomyUpdates = (studentId: string) => jsonRequest<StudentTaxonomyUpdate[]>("/api/market-taxonomy/student/updates", studentId);
export const decideStudentTaxonomyUpdate = (studentId: string, updateId: string, decision: "keep_current" | "recalculate" | "dismiss", confirmed = false) => jsonRequest<StudentTaxonomyUpdate>(`/api/market-taxonomy/student/updates/${encodeURIComponent(updateId)}/decision`, studentId, { method: "POST", body: JSON.stringify({ decision, confirmed }) });

export const getMarketGovernance = () => jsonRequest<MarketGovernance>("/api/market-taxonomy/curator/governance");
export const getMarketSources = () => jsonRequest<MarketSource[]>("/api/market-taxonomy/curator/sources");
export const getMarketSignals = () => jsonRequest<SkillSignal[]>("/api/market-taxonomy/curator/signals");
export const getTaxonomyProposals = () => jsonRequest<ChangeProposal[]>("/api/market-taxonomy/curator/proposals");
export const getTaxonomyVersions = () => jsonRequest<TaxonomyVersion[]>("/api/market-taxonomy/curator/versions");
export const submitTaxonomyProposal = (proposalId: string) => jsonRequest<ChangeProposal>(`/api/market-taxonomy/curator/proposals/${encodeURIComponent(proposalId)}/submit`, undefined, { method: "POST" });
export const decideTaxonomyProposal = (proposalId: string, decision: "approve" | "reject", rationale: string) => jsonRequest<ChangeProposal>(`/api/market-taxonomy/curator/proposals/${encodeURIComponent(proposalId)}/decision`, undefined, { method: "POST", body: JSON.stringify({ decision, rationale }) });
