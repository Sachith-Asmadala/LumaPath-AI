const apiBase = (process.env.LUMAPATH_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export async function proxyPortfolio(request: Request, backendPath: string) {
  const studentId = request.headers.get("x-luma-student-id");
  if (!studentId) return Response.json({ detail: "Student identity is required." }, { status: 401 });
  const url = new URL(request.url);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const upstream = await fetch(`${apiBase}${backendPath}${url.search}`, {
      method: request.method, cache: "no-store", signal: controller.signal,
      headers: { "X-Luma-Student-Id": studentId, ...(hasBody ? { "Content-Type": request.headers.get("content-type") ?? "application/json" } : {}) },
      body: body && body.byteLength ? body : undefined,
    });
    const payload = await upstream.arrayBuffer();
    return new Response(payload.byteLength ? payload : null, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store, private" } });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Portfolio service timed out. Try again." : "Portfolio backend is unavailable. Start the LumaPath API and try again.";
    return Response.json({ detail: message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally { clearTimeout(timeout); }
}
