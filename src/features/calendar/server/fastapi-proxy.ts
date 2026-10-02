const apiBase = (process.env.LUMAPATH_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
export async function proxyCalendar(request: Request, backendPath: string) {
  const studentId = request.headers.get("x-luma-student-id");
  if (!studentId) return Response.json({ detail: "Student identity is required." }, { status: 401 });
  const url = new URL(request.url); const hasBody = !["GET","HEAD"].includes(request.method); const body = hasBody ? await request.arrayBuffer() : undefined;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const headers: Record<string,string> = { "X-Luma-Student-Id": studentId };
    if (hasBody) headers["Content-Type"] = request.headers.get("content-type") ?? "application/json";
    const upstream = await fetch(`${apiBase}${backendPath}${url.search}`, { method: request.method, cache: "no-store", signal: controller.signal, headers, body: body?.byteLength ? body : undefined });
    const payload = await upstream.arrayBuffer();
    return new Response(payload.byteLength ? payload : null, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store, private" } });
  } catch (error) {
    return Response.json({ detail: error instanceof Error && error.name === "AbortError" ? "Calendar service timed out. Your plan was not changed." : "Calendar backend is unavailable. Your plan was not changed." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally { clearTimeout(timeout); }
}
