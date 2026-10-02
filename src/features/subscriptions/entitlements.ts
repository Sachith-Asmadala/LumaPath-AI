import { toast } from "sonner";

export type PlanId = "free" | "pro" | "institution";
export function hasProFeatures(plan: PlanId | undefined) { return plan === "pro" || plan === "institution"; }
export type Entitlement = { limit: number | null; used: number; remaining: number | null; period: string; enabled: boolean; resets_at: string | null };
export type Subscription = { subject_id: string; plan: PlanId; name: string; entitlements: Record<string, Entitlement>; demo_switch_enabled: boolean; billing_connected: boolean; period_timezone: string };
export type PlanError = { code: "PLAN_LIMIT_REACHED" | "PLAN_FEATURE_REQUIRED"; feature: string; plan: PlanId; limit: number | null; used: number; upgrade_required: boolean; required_plan?: PlanId };
export const planNames: Record<PlanId, string> = { free: "LumaPath Free", pro: "LumaPath Pro", institution: "LumaPath Institution" };
export const featureLabels: Record<string, string> = { career_comparisons: "career comparisons", comparison_roles: "roles per comparison", assistant_requests: "assistant requests", intelligence_items: "Career Intelligence items", cv_analyses: "CV analyses", document_analyses: "document analyses", opportunity_readiness: "preparation proposals", saved_scenarios: "saved career scenarios", adaptive_automation: "advanced adaptive planning", regional_comparison: "regional market comparison", scenario_history: "saved scenario history", advanced_opportunity_preparation: "advanced Opportunity Preparation", institutional_analytics: "institutional analytics", taxonomy_governance: "taxonomy governance", institution_mentoring: "institutional mentoring" };

export function isPlanError(value: unknown): value is PlanError {
  if (!value || typeof value !== "object") return false;
  const error = value as Partial<PlanError>;
  return (error.code === "PLAN_LIMIT_REACHED" || error.code === "PLAN_FEATURE_REQUIRED") && typeof error.feature === "string" && ["free", "pro", "institution"].includes(error.plan ?? "") && typeof error.used === "number";
}
export function planErrorMessage(error: PlanError) {
  const label = featureLabels[error.feature] ?? error.feature.replaceAll("_", " ");
  if (error.code === "PLAN_LIMIT_REACHED") {
    if (error.feature === "comparison_roles") return `${planNames[error.plan]} supports up to ${error.limit} roles per comparison. Choose fewer roles or review your plan.`;
    const period = ["assistant_requests", "intelligence_items"].includes(error.feature) ? "today" : ["comparison_roles", "saved_scenarios"].includes(error.feature) ? "for this plan" : "this month";
    return error.plan === "free" ? `You've used your ${error.limit} free ${label} ${period}.` : `You've reached the ${error.limit} ${label} limit for ${planNames[error.plan]} ${period}.`;
  }
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} is included with ${planNames[error.required_plan ?? "pro"]}. Your basic workspace remains available.`;
}

// Reuse each module's typed error; only the plan-specific message and UI event are shared.
export function apiErrorMessage(body: unknown, fallback: string): string {
  const payload = body && typeof body === "object" ? body as { detail?: unknown } : null;
  const error = isPlanError(body) ? body : isPlanError(payload?.detail) ? payload.detail : null;
  if (error) {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("lumapath:plan-required", { detail: error }));
    return planErrorMessage(error);
  }
  return typeof payload?.detail === "string" ? payload.detail : fallback;
}

// The existing prototype identity comes from the local student state. Production
// must replace development headers with verified session claims in the API proxies.
export function demoStudentHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const state = JSON.parse(localStorage.getItem("lumapath-demo-state-v1") ?? "null");
    const id = state?.student?.id;
    return typeof id === "string" ? { "X-Luma-Student-Id": id } : {};
  } catch { return {}; }
}

export async function authorizeAdaptivePlanning(studentId: string): Promise<boolean> {
  try {
    const response = await fetch("/api/subscriptions/automation/authorize", { method: "POST", headers: { "X-Luma-Student-Id": studentId }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
    const body = await response.json();
    if (!response.ok) { const message = apiErrorMessage(body, "Advanced planning could not be authorized."); if (!isPlanError(body) && !isPlanError(body?.detail)) toast.error(message); return false; }
    return body?.authorized === true;
  } catch { toast.error("Advanced planning is unavailable. Please try again."); return false; }
}
