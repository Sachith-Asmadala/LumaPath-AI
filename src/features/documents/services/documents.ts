import type { DocumentKind, DocumentProposedAction, PlannerValidationContext, StudentDocument } from "@/features/documents/domain/documents";
import { isStudentDocument } from "@/features/documents/domain/documents";

export class DocumentApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "DocumentApiError";
  }
}

async function documentFetch(path: string, studentId: string, init: RequestInit = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    headers.set("X-Luma-Student-Id", studentId);
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...init, cache: "no-store", headers, signal: controller.signal });
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    if (!response.ok) throw new DocumentApiError(body?.detail ?? `Document request failed (${response.status}).`, response.status);
    return body;
  } catch (error) {
    if (error instanceof DocumentApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new DocumentApiError("Document processing request timed out. The file may still be queued; refresh its status.");
    throw new DocumentApiError("Document service is unavailable. Start the LumaPath API and try again.");
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function uploadStudentDocument(studentId: string, file: File, kind: DocumentKind | "auto", moduleId?: string | null): Promise<StudentDocument> {
  const form = new FormData();
  form.append("file", file);
  if (kind !== "auto") form.append("document_kind", kind);
  if (moduleId) form.append("module_id", moduleId);
  const body = await documentFetch("/api/documents", studentId, { method: "POST", body: form }, 30_000);
  if (!isStudentDocument(body)) throw new DocumentApiError("Document service returned an invalid upload response.");
  return body;
}

export async function listStudentDocuments(studentId: string): Promise<StudentDocument[]> {
  const body = await documentFetch("/api/documents", studentId, { method: "GET" });
  if (!body || typeof body !== "object" || !Array.isArray((body as { items?: unknown }).items)) throw new DocumentApiError("Document list response is invalid.");
  return (body as { items: unknown[] }).items.filter(isStudentDocument);
}

export async function getStudentDocument(studentId: string, documentId: string): Promise<StudentDocument> {
  const body = await documentFetch(`/api/documents/${encodeURIComponent(documentId)}`, studentId, { method: "GET" });
  if (!isStudentDocument(body)) throw new DocumentApiError("Document status response is invalid.");
  return body;
}

export async function retryStudentDocument(studentId: string, documentId: string) {
  return documentFetch(`/api/documents/${encodeURIComponent(documentId)}/retry`, studentId, { method: "POST" });
}

export async function approveDocumentAction(studentId: string, documentId: string, action: DocumentProposedAction, plannerContext: PlannerValidationContext) {
  return documentFetch(`/api/documents/${encodeURIComponent(documentId)}/actions/approve`, studentId, {
    method: "POST",
    body: JSON.stringify({ action, planner_context: plannerContext }),
  });
}

export async function deleteStudentDocument(studentId: string, documentId: string) {
  return documentFetch(`/api/documents/${encodeURIComponent(documentId)}`, studentId, { method: "DELETE" });
}
