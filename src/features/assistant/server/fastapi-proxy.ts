const apiBase = (process.env.LUMAPATH_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export async function proxyStudyAssistant(request: Request, backendPath: string) {
  const studentId = request.headers.get("x-luma-student-id");
  if (!studentId) return Response.json({ detail: "Student identity is required." }, { status: 401 });
  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") body = await request.text();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const upstream = await fetch(`${apiBase}${backendPath}`, {
      method: request.method,
      cache: "no-store",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-Luma-Student-Id": studentId },
      body: body || undefined,
    });
    const payload = await upstream.text();
    return new Response(payload || null, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Study Assistant timed out. Your work was not saved."
      : "Study Assistant backend is unavailable. Start the LumaPath API and try again.";
    return Response.json({ detail: message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timeout);
  }
}
