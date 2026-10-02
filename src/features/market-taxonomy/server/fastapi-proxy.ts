const apiBase = (process.env.LUMAPATH_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

async function forward(request: Request, backendPath: string, headers: Record<string, string>, unavailable: string) {
  const url = new URL(request.url);
  const hasBody = !["GET", "HEAD"].includes(request.method);
  const body = hasBody ? await request.arrayBuffer() : undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const upstream = await fetch(`${apiBase}${backendPath}${url.search}`, {
      method: request.method, cache: "no-store", signal: controller.signal,
      headers: { ...headers, ...(hasBody ? { "Content-Type": request.headers.get("content-type") ?? "application/json" } : {}) },
      body: body && body.byteLength ? body : undefined,
    });
    const payload = await upstream.arrayBuffer();
    return new Response(payload.byteLength ? payload : null, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store, private" } });
  } catch (error) {
    const detail = error instanceof Error && error.name === "AbortError" ? "Market taxonomy request timed out. No taxonomy state was changed." : unavailable;
    return Response.json({ detail }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally { clearTimeout(timeout); }
}

export async function proxyStudentMarketTaxonomy(request: Request, backendPath: string) {
  const development = process.env.NODE_ENV !== "production";
  const studentId = request.headers.get("x-luma-student-id") ?? (development ? process.env.LUMAPATH_DEMO_STUDENT_ID ?? "demo-student" : null);
  if (!studentId) return Response.json({ detail: "Verified student session is required." }, { status: 401 });
  return forward(request, backendPath, { "X-Luma-Student-Id": studentId }, "Market taxonomy service is unavailable. Your active pathway was not changed.");
}

export async function proxyCuratorMarketTaxonomy(request: Request, backendPath: string) {
  const development = process.env.NODE_ENV !== "production";
  const curatorId = request.headers.get("x-luma-curator-id") ?? (development ? process.env.LUMAPATH_DEMO_CURATOR_ID ?? "taxonomy-reviewer-demo" : null);
  const role = request.headers.get("x-luma-curator-role") ?? (development ? process.env.LUMAPATH_DEMO_CURATOR_ROLE ?? "taxonomy_reviewer" : null);
  const regionScope = request.headers.get("x-luma-region-scope") ?? (development ? process.env.LUMAPATH_DEMO_REGION_SCOPE ?? "international,lk" : null);
  if (!curatorId || !role || !regionScope) return Response.json({ detail: "Verified taxonomy curator session is required." }, { status: 401 });
  return forward(request, backendPath, { "X-Luma-Curator-Id": curatorId, "X-Luma-Curator-Role": role, "X-Luma-Region-Scope": regionScope }, "Market taxonomy curation service is unavailable. No proposal was changed.");
}
