import { apiErrorMessage } from "@/features/subscriptions/entitlements";
import { isCvDocument, type CvAnalysis, type CvDocument, type CvExport, type CvSection, type CvSuggestion } from "@/features/cv/domain/cv";

export class CvApiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "CvApiError"; }
}

async function cvFetch(path: string, studentId: string, init: RequestInit = {}, timeoutMs = 18_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    headers.set("X-Luma-Student-Id", studentId);
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...init, cache: "no-store", headers, signal: controller.signal });
    const body = response.status === 204 ? null : await response.json().catch(() => null) as { detail?: string } | null;
    if (!response.ok) throw new CvApiError(apiErrorMessage(body, `CV request failed (${response.status}).`), response.status);
    return body;
  } catch (error) {
    if (error instanceof CvApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new CvApiError("CV request timed out. No CV data was changed.");
    throw new CvApiError("CV service is unavailable. Start the LumaPath API and try again.");
  } finally { window.clearTimeout(timer); }
}

export async function listCvDocuments(studentId: string): Promise<CvDocument[]> {
  const body = await cvFetch("/api/cv/documents", studentId) as { items?: unknown[] };
  return Array.isArray(body?.items) ? body.items.filter(isCvDocument) : [];
}
export async function createPastedCv(studentId: string, input: { title: string; target_role: string; retention_days: 7 | 30 | 90; source_text: string }): Promise<CvDocument> {
  const body = await cvFetch("/api/cv/documents/paste", studentId, { method: "POST", body: JSON.stringify(input) });
  if (!isCvDocument(body)) throw new CvApiError("CV service returned an invalid document response.");
  return body;
}
export async function uploadCv(studentId: string, file: File, targetRole: string, retentionDays: 7 | 30 | 90): Promise<CvDocument> {
  const form = new FormData(); form.set("file", file); form.set("target_role", targetRole); form.set("retention_days", String(retentionDays));
  const body = await cvFetch("/api/cv/documents/upload", studentId, { method: "POST", body: form }, 25_000);
  if (!isCvDocument(body)) throw new CvApiError("CV service returned an invalid upload response.");
  return body;
}
export async function saveCvSections(studentId: string, documentId: string, sections: CvSection[]): Promise<CvDocument> {
  const body = await cvFetch(`/api/cv/documents/${encodeURIComponent(documentId)}/sections`, studentId, { method: "PUT", body: JSON.stringify({ sections, confirmed: true }) });
  if (!isCvDocument(body)) throw new CvApiError("CV service returned an invalid section response.");
  return body;
}
export async function analyzeCv(studentId: string, documentId: string): Promise<CvAnalysis> {
  return cvFetch(`/api/cv/documents/${encodeURIComponent(documentId)}/analysis`, studentId, { method: "POST" }) as Promise<CvAnalysis>;
}
export async function decideCvSuggestion(studentId: string, documentId: string, suggestionId: string, decision: "accepted" | "dismissed", editedText: string): Promise<CvSuggestion> {
  return cvFetch(`/api/cv/documents/${encodeURIComponent(documentId)}/suggestions/${encodeURIComponent(suggestionId)}`, studentId, { method: "POST", body: JSON.stringify({ decision, edited_text: editedText }) }) as Promise<CvSuggestion>;
}
export async function exportCv(studentId: string, documentId: string): Promise<CvExport> {
  return cvFetch(`/api/cv/documents/${encodeURIComponent(documentId)}/export`, studentId) as Promise<CvExport>;
}
export async function deleteCvSource(studentId: string, documentId: string) { return cvFetch(`/api/cv/documents/${encodeURIComponent(documentId)}/source`, studentId, { method: "DELETE" }); }
export async function deleteCvAnalysis(studentId: string, documentId: string) { return cvFetch(`/api/cv/documents/${encodeURIComponent(documentId)}/analysis`, studentId, { method: "DELETE" }); }
export async function deleteCvDocument(studentId: string, documentId: string) { return cvFetch(`/api/cv/documents/${encodeURIComponent(documentId)}`, studentId, { method: "DELETE" }); }
