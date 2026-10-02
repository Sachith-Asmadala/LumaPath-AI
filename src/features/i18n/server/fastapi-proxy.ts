const apiBase = (process.env.LUMAPATH_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export async function proxyProfilePreference(request: Request, backendPath: string) {
  const studentId = request.headers.get("x-luma-student-id");
  if (!studentId) return Response.json({ detail: "Student identity is required." }, { status: 401 });
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.text() : undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const upstream = await fetch(`${apiBase}${backendPath}`, {
      method: request.method,
      cache: "no-store",
      signal: controller.signal,
      headers: { "X-Luma-Student-Id": studentId, ...(hasBody ? { "Content-Type": "application/json" } : {}) },
      body: body || undefined,
    });
    const payload = await upstream.text();
    return new Response(payload || null, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store, private" },
    });
  } catch {
    return Response.json({ detail: "Profile preference service is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timeout);
  }
}
