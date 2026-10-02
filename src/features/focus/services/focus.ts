import { isFocusSession, type FocusSessionRecord } from "@/features/focus/domain/focus";

export class FocusApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "FocusApiError";
  }
}

async function focusFetch(path: string, studentId: string, init: RequestInit = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    headers.set("X-Luma-Student-Id", studentId);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...init, cache: "no-store", headers, signal: controller.signal });
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    if (!response.ok) throw new FocusApiError(body?.detail ?? `Focus request failed (${response.status}).`, response.status);
    return body;
  } catch (error) {
    if (error instanceof FocusApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new FocusApiError("Focus service timed out. The session was not changed.");
    throw new FocusApiError("Focus service is unavailable. Your timer has not been marked complete.");
  } finally {
    window.clearTimeout(timeout);
  }
}

function requireSession(value: unknown): FocusSessionRecord {
  if (!isFocusSession(value)) throw new FocusApiError("Focus service returned an invalid session.");
  return value;
}

export async function startFocusSession(studentId: string, payload: unknown) {
  return requireSession(await focusFetch("/api/focus/sessions", studentId, { method: "POST", body: JSON.stringify(payload) }));
}

export async function getActiveFocusSession(studentId: string): Promise<FocusSessionRecord | null> {
  const value = await focusFetch("/api/focus/sessions/active", studentId);
  if (value === null) return null;
  return requireSession(value);
}

export async function getFocusSession(studentId: string, sessionId: string) {
  return requireSession(await focusFetch(`/api/focus/sessions/${encodeURIComponent(sessionId)}`, studentId));
}

export async function pauseFocusSession(studentId: string, sessionId: string) {
  return requireSession(await focusFetch(`/api/focus/sessions/${encodeURIComponent(sessionId)}/pause`, studentId, { method: "POST" }));
}

export async function resumeFocusSession(studentId: string, sessionId: string) {
  return requireSession(await focusFetch(`/api/focus/sessions/${encodeURIComponent(sessionId)}/resume`, studentId, { method: "POST" }));
}

export async function heartbeatFocusSession(studentId: string, sessionId: string) {
  return requireSession(await focusFetch(`/api/focus/sessions/${encodeURIComponent(sessionId)}/heartbeat`, studentId, { method: "POST" }, 8_000));
}

export async function finishFocusSession(studentId: string, sessionId: string, payload: unknown) {
  return requireSession(await focusFetch(`/api/focus/sessions/${encodeURIComponent(sessionId)}/finish`, studentId, { method: "POST", body: JSON.stringify(payload) }));
}
