import type { NotificationCandidateInput, NotificationInbox, NotificationPreferences } from "@/features/notifications/domain/notifications";

export class NotificationApiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "NotificationApiError"; }
}

async function api<T>(path: string, studentId: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const headers = new Headers(init.headers); headers.set("X-Luma-Student-Id", studentId); if (init.body) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...init, headers, signal: controller.signal, cache: "no-store" });
    const body = await response.json().catch(() => null) as ({ detail?: string } & T) | null;
    if (!response.ok) throw new NotificationApiError(body?.detail ?? `Notification request failed (${response.status}).`, response.status);
    return body as T;
  } catch (error) {
    if (error instanceof NotificationApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new NotificationApiError("Notification service timed out. No preference or inbox state was fabricated.");
    throw new NotificationApiError("Notification service is unavailable. Your existing tasks and plans are unchanged.");
  } finally { window.clearTimeout(timeout); }
}

export const getNotificationPreferences = (studentId: string) => api<NotificationPreferences>("/api/notifications/preferences", studentId);
export const updateNotificationPreferences = (studentId: string, input: Omit<NotificationPreferences,"student_id"|"updated_at"|"push_provider_available"|"email_provider_available">) => api<NotificationPreferences>("/api/notifications/preferences", studentId, { method: "PUT", body: JSON.stringify(input) });
export const syncNotificationCandidates = (studentId: string, items: NotificationCandidateInput[]) => api<Record<string,number>>("/api/notifications/candidates/sync", studentId, { method: "POST", body: JSON.stringify({ items }) });
export const getNotificationInbox = (studentId: string, includeDismissed=false) => api<NotificationInbox>(`/api/notifications/inbox?include_dismissed=${includeDismissed}`, studentId);
export const markNotificationDelivery = (studentId: string, deliveryId: string, action: "opened"|"dismissed"|"acted") => api<{saved:boolean}>(`/api/notifications/deliveries/${encodeURIComponent(deliveryId)}/${action}`, studentId, { method: "POST" });
export const retryNotificationDeliveries = (studentId: string) => api<{attempted:number;delivered:number;failed:number}>("/api/notifications/deliveries/retry", studentId, { method: "POST" });
