const apiBase = (process.env.LUMAPATH_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export async function proxyMentorStudent(request: Request, backendPath: string) {
  const studentId = request.headers.get("x-luma-student-id");
  if (!studentId) return Response.json({ detail: "Student identity is required." }, { status: 401 });
  return forward(request, backendPath, { "X-Luma-Student-Id": studentId });
}

export async function proxyMentorAccess(request: Request, backendPath: string, requiresToken = true) {
  const token = request.headers.get("x-luma-mentor-token");
  if (requiresToken && !token) return Response.json({ detail: "Mentor access token is required." }, { status: 401 });
  return forward(request, backendPath, token ? { "X-Luma-Mentor-Token": token } : {});
}

async function forward(request: Request, backendPath: string, authHeaders: Record<string, string>) {
  const hasBody = !["GET", "HEAD"].includes(request.method);
  const body = hasBody ? await request.arrayBuffer() : undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const upstream = await fetch(`${apiBase}${backendPath}`, {
      method: request.method, cache: "no-store", signal: controller.signal,
      headers: { ...authHeaders, ...(hasBody ? { "Content-Type": request.headers.get("content-type") ?? "application/json" } : {}) },
      body: body?.byteLength ? body : undefined,
    });
    const payload = await upstream.arrayBuffer();
    return new Response(payload.byteLength ? payload : null, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store, private" } });
  } catch (error) {
    return Response.json({ detail: error instanceof Error && error.name === "AbortError" ? "Mentor service timed out. No sharing or plan changes were made." : "Mentor service is unavailable. No sharing or plan changes were made." }, { status: 503, headers: { "Cache-Control": "no-store, private" } });
  } finally { clearTimeout(timeout); }
}
