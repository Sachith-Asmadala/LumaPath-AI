import type { CalendarCommitResult, CalendarConnection, CalendarExistingRecord, CalendarImportedItem, CalendarPreview, CalendarDecision, CalendarSyncHistory } from "@/features/calendar/domain/calendar";

export class CalendarApiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "CalendarApiError"; }
}

async function api<T>(path: string, studentId: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController(); const timer = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const headers = new Headers(init.headers); headers.set("X-Luma-Student-Id", studentId); if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...init, headers, signal: controller.signal, cache: "no-store" });
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    if (!response.ok) throw new CalendarApiError(body?.detail ?? `Calendar request failed (${response.status}).`, response.status);
    return body as T;
  } catch (error) {
    if (error instanceof CalendarApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new CalendarApiError("Calendar service timed out. Your existing plan was not changed.");
    throw new CalendarApiError("Calendar service is unavailable. Your existing plan was not changed.");
  } finally { window.clearTimeout(timer); }
}

export async function previewCalendar(studentId: string, file: File, timezone: string, existingRecords: CalendarExistingRecord[], connectionId?: string | null) {
  const form = new FormData(); form.set("file", file); form.set("timezone", timezone); form.set("existing_records_json", JSON.stringify(existingRecords)); if (connectionId) form.set("connection_id", connectionId);
  return api<CalendarPreview>("/api/calendar/imports/preview", studentId, { method: "POST", body: form });
}
export const commitCalendar = (studentId: string, runId: string, decisions: Array<{ preview_key: string; action: CalendarDecision }>, idempotencyKey: string) => api<CalendarCommitResult>(`/api/calendar/sync-runs/${encodeURIComponent(runId)}/commit`, studentId, { method: "POST", body: JSON.stringify({ decisions, idempotency_key: idempotencyKey }) });
export async function listCalendarConnections(studentId: string) { const body = await api<{items:CalendarConnection[]}>("/api/calendar/connections", studentId); return body.items ?? []; }
export async function listCalendarSyncHistory(studentId: string) { const body = await api<{items:CalendarSyncHistory[]}>("/api/calendar/sync-history", studentId); return body.items ?? []; }
export async function listCalendarItems(studentId: string, connectionId?: string, includeDeleted=false) { const query = new URLSearchParams(); if (connectionId) query.set("connection_id",connectionId); if (includeDeleted) query.set("include_deleted","true"); const body = await api<{items:CalendarImportedItem[]}>(`/api/calendar/items?${query}`, studentId); return body.items ?? []; }
export const revokeCalendarConnection = (studentId: string, connectionId: string) => api<{connection:CalendarConnection;sync_stopped:boolean}>(`/api/calendar/connections/${encodeURIComponent(connectionId)}/revoke`, studentId, { method: "POST" });
export const cleanupCalendarConnection = (studentId: string, connectionId: string, removeInternalRecords: boolean) => api<{connection_id:string;deleted_imported_items:number;actions:CalendarCommitResult["actions"];internal_records_removed:boolean}>(`/api/calendar/connections/${encodeURIComponent(connectionId)}/cleanup`, studentId, { method: "POST", body: JSON.stringify({ remove_internal_records: removeInternalRecords }) });
export const saveCalendarOverrides = (studentId: string, itemId: string, fields: string[]) => api<CalendarImportedItem>(`/api/calendar/items/${encodeURIComponent(itemId)}/overrides`, studentId, { method: "PUT", body: JSON.stringify({ fields }) });
