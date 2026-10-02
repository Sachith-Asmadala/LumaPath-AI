import { apiErrorMessage } from "@/features/subscriptions/entitlements";
import type { ProposedAssistantAction, StudyAssistantRequest, StudyAssistantResponse } from "@/features/assistant/domain/study-assistant";
import { isStudyAssistantResponse } from "@/features/assistant/domain/study-assistant";

export class StudyAssistantApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "StudyAssistantApiError";
  }
}

async function apiFetch(path: string, studentId: string, init: RequestInit, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-Luma-Student-Id": studentId, ...(init.headers ?? {}) },
    });
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    if (!response.ok) throw new StudyAssistantApiError(apiErrorMessage(body, `Study Assistant request failed (${response.status}).`), response.status);
    return body;
  } catch (error) {
    if (error instanceof StudyAssistantApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new StudyAssistantApiError("Study Assistant timed out. Your work was not saved.");
    throw new StudyAssistantApiError("Study Assistant is unavailable. Start the LumaPath API and try again.");
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function syncStudyAssistantContext(studentId: string, snapshot: unknown) {
  return apiFetch("/api/study-assistant/context", studentId, { method: "PUT", body: JSON.stringify(snapshot) });
}

export async function requestStudyAssistant(studentId: string, request: StudyAssistantRequest): Promise<StudyAssistantResponse> {
  const body = await apiFetch("/api/study-assistant/respond", studentId, { method: "POST", body: JSON.stringify(request) });
  if (!isStudyAssistantResponse(body)) throw new StudyAssistantApiError("Study Assistant returned an invalid response. Nothing was saved.");
  return body;
}

export async function approveStudyAssistantAction(studentId: string, responseId: string, sessionId: string, action: ProposedAssistantAction) {
  return apiFetch("/api/study-assistant/actions/approve", studentId, { method: "POST", body: JSON.stringify({ response_id: responseId, session_id: sessionId, action }) });
}

export async function sendStudyAssistantFeedback(studentId: string, sessionId: string, responseId: string, helpful: boolean) {
  return apiFetch(`/api/study-assistant/sessions/${encodeURIComponent(sessionId)}/feedback`, studentId, { method: "POST", body: JSON.stringify({ response_id: responseId, helpful, note: "" }) });
}
