import type { ApplicationInput, ApplicationReminder, ApplicationStatus, InternshipApplication, PlannerAction } from "@/features/internships/domain/internships";
export class InternshipApiError extends Error { constructor(message: string, readonly status?: number) { super(message); this.name = "InternshipApiError"; } }
async function api(path: string, studentId: string, init: RequestInit = {}) {
  const controller = new AbortController(); const timer = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const headers = new Headers(init.headers); headers.set("X-Luma-Student-Id", studentId); if (init.body) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...init, headers, signal: controller.signal, cache: "no-store" });
    if (response.status === 204) return null;
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    if (!response.ok) throw new InternshipApiError(body?.detail ?? `Application request failed (${response.status}).`, response.status);
    return body;
  } catch (error) {
    if (error instanceof InternshipApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new InternshipApiError("Application service timed out. No tracking data was changed.");
    throw new InternshipApiError("Application service is unavailable. Start the LumaPath API and try again.");
  } finally { window.clearTimeout(timer); }
}
export async function listApplications(studentId: string, includeArchived = false): Promise<InternshipApplication[]> { const body = await api(`/api/internships/applications?include_archived=${includeArchived}`, studentId) as { items?: InternshipApplication[] }; return Array.isArray(body.items) ? body.items : []; }
export async function createApplication(studentId: string, input: ApplicationInput) { return api("/api/internships/applications", studentId, { method: "POST", body: JSON.stringify(input) }) as Promise<InternshipApplication>; }
export async function updateApplication(studentId: string, id: string, input: Omit<ApplicationInput,"source_type"|"source_reference">) { return api(`/api/internships/applications/${encodeURIComponent(id)}`, studentId, { method: "PUT", body: JSON.stringify(input) }) as Promise<InternshipApplication>; }
export async function deleteApplication(studentId: string, id: string) { await api(`/api/internships/applications/${encodeURIComponent(id)}`, studentId, { method: "DELETE" }); }
export async function transitionApplication(studentId: string, id: string, status: ApplicationStatus, note: string, idempotency_key: string) { return api(`/api/internships/applications/${encodeURIComponent(id)}/status`, studentId, { method: "POST", body: JSON.stringify({ status, note, idempotency_key }) }) as Promise<InternshipApplication>; }
export async function archiveApplication(studentId: string, id: string, archived: boolean, outcome_notes: string, idempotency_key: string) { return api(`/api/internships/applications/${encodeURIComponent(id)}/archive`, studentId, { method: "POST", body: JSON.stringify({ archived, outcome_notes, idempotency_key }) }) as Promise<InternshipApplication>; }
export async function createReminder(studentId: string, id: string, payload: Record<string, unknown>) { return api(`/api/internships/applications/${encodeURIComponent(id)}/reminders`, studentId, { method: "POST", body: JSON.stringify(payload) }) as Promise<ApplicationReminder>; }
export async function updateReminder(studentId: string, id: string, reminderId: string, payload: Record<string, unknown>) { return api(`/api/internships/applications/${encodeURIComponent(id)}/reminders/${encodeURIComponent(reminderId)}`, studentId, { method: "PUT", body: JSON.stringify(payload) }) as Promise<ApplicationReminder>; }
export async function createPlannerAction(studentId: string, id: string, payload: Record<string, unknown>) { return api(`/api/internships/applications/${encodeURIComponent(id)}/planner-actions`, studentId, { method: "POST", body: JSON.stringify(payload) }) as Promise<PlannerAction>; }
