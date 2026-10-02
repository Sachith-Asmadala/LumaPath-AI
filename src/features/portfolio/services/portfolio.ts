import { isPortfolioProject, type PortfolioAnalysis, type PortfolioProject, type PortfolioProjectInput, type PortfolioRecommendation } from "@/features/portfolio/domain/portfolio";

export class PortfolioApiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "PortfolioApiError"; }
}

async function portfolioFetch(path: string, studentId: string, init: RequestInit = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    headers.set("X-Luma-Student-Id", studentId);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...init, cache: "no-store", headers, signal: controller.signal });
    if (response.status === 204) return null;
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    if (!response.ok) throw new PortfolioApiError(body?.detail ?? `Portfolio request failed (${response.status}).`, response.status);
    return body;
  } catch (error) {
    if (error instanceof PortfolioApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new PortfolioApiError("Portfolio request timed out. No project data was changed.");
    throw new PortfolioApiError("Portfolio service is unavailable. Start the LumaPath API and try again.");
  } finally { window.clearTimeout(timer); }
}

export async function listPortfolioProjects(studentId: string): Promise<PortfolioProject[]> {
  const body = await portfolioFetch("/api/portfolio/projects", studentId) as { items?: unknown[] };
  const items = Array.isArray(body?.items) ? body.items.filter(isPortfolioProject) : [];
  return items;
}

export async function createPortfolioProject(studentId: string, input: PortfolioProjectInput): Promise<PortfolioProject> {
  const body = await portfolioFetch("/api/portfolio/projects", studentId, { method: "POST", body: JSON.stringify(input) });
  if (!isPortfolioProject(body)) throw new PortfolioApiError("Portfolio returned an invalid project response.");
  return body;
}

export async function updatePortfolioProject(studentId: string, projectId: string, input: PortfolioProjectInput): Promise<PortfolioProject> {
  const body = await portfolioFetch(`/api/portfolio/projects/${encodeURIComponent(projectId)}`, studentId, { method: "PUT", body: JSON.stringify(input) });
  if (!isPortfolioProject(body)) throw new PortfolioApiError("Portfolio returned an invalid project response.");
  return body;
}

export async function deletePortfolioProject(studentId: string, projectId: string) {
  await portfolioFetch(`/api/portfolio/projects/${encodeURIComponent(projectId)}`, studentId, { method: "DELETE" });
}

export async function analyzePortfolioProject(studentId: string, projectId: string, repositoryId?: string): Promise<PortfolioAnalysis> {
  const query = repositoryId ? `?repository_id=${encodeURIComponent(repositoryId)}` : "";
  return portfolioFetch(`/api/portfolio/projects/${encodeURIComponent(projectId)}/analysis${query}`, studentId, { method: "POST" }) as Promise<PortfolioAnalysis>;
}

export async function decidePortfolioRecommendation(studentId: string, projectId: string, recommendationId: string, decision: "accepted" | "dismissed", editedText?: string | null): Promise<PortfolioRecommendation> {
  return portfolioFetch(`/api/portfolio/projects/${encodeURIComponent(projectId)}/recommendations/${encodeURIComponent(recommendationId)}`, studentId, {
    method: "POST", body: JSON.stringify({ decision, edited_text: editedText ?? null }),
  }) as Promise<PortfolioRecommendation>;
}

export async function revokeRepositoryReference(studentId: string, projectId: string, repositoryId: string) {
  return portfolioFetch(`/api/portfolio/projects/${encodeURIComponent(projectId)}/repositories/${encodeURIComponent(repositoryId)}/revoke`, studentId, { method: "POST" });
}

export async function deleteImportedRepositoryData(studentId: string, projectId: string, repositoryId: string) {
  return portfolioFetch(`/api/portfolio/projects/${encodeURIComponent(projectId)}/repositories/${encodeURIComponent(repositoryId)}`, studentId, { method: "DELETE" });
}
