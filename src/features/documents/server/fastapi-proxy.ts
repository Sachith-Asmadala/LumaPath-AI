const apiBase = (process.env.LUMAPATH_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export async function proxyDocuments(request: Request, backendPath: string) {
  const studentId = request.headers.get("x-luma-student-id");
  if (!studentId) return Response.json({ detail: "Student identity is required." }, { status: 401 });
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const contentType = request.headers.get("content-type");
  const body = hasBody ? await request.arrayBuffer() : undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const headers = new Headers({ "X-Luma-Student-Id": studentId });
    if (contentType && hasBody) headers.set("Content-Type", contentType);
    const upstream = await fetch(`${apiBase}${backendPath}`, {
      method: request.method,
      cache: "no-store",
      signal: controller.signal,
      headers,
      body: body && body.byteLength ? body : undefined,
    });
    const payload = await upstream.arrayBuffer();
    return new Response(payload.byteLength ? payload : null, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Document service timed out while accepting this request. Refresh before uploading again."
      : "Document backend is unavailable. Start the LumaPath API and try again.";
    return Response.json({ detail: message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timeout);
  }
}
