const apiBase = (process.env.LUMAPATH_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

function administratorClaims(request: Request) {
  const development = process.env.NODE_ENV !== "production";
  return {
    adminId: request.headers.get("x-luma-admin-id") ?? (development ? process.env.LUMAPATH_DEMO_ADMIN_ID ?? "programme-admin-demo" : null),
    role: request.headers.get("x-luma-admin-role") ?? (development ? process.env.LUMAPATH_DEMO_ADMIN_ROLE ?? "programme_admin" : null),
    institutionId: request.headers.get("x-luma-institution-id") ?? (development ? process.env.LUMAPATH_DEMO_INSTITUTION_ID ?? "luma-demo-university" : null),
  };
}

export async function proxyInstitutionalAnalytics(request: Request, backendPath: string) {
  const claims = administratorClaims(request);
  if (!claims.adminId || !claims.role || !claims.institutionId) {
    return Response.json({ detail: "Verified administrator session is required." }, { status: 401 });
  }
  const url = new URL(request.url);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const upstream = await fetch(`${apiBase}${backendPath}${url.search}`, {
      method: request.method,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "X-Luma-Admin-Id": claims.adminId,
        "X-Luma-Admin-Role": claims.role,
        "X-Luma-Institution-Id": claims.institutionId,
        ...(hasBody ? { "Content-Type": request.headers.get("content-type") ?? "application/json" } : {}),
      },
      body: body && body.byteLength ? body : undefined,
    });
    const payload = await upstream.arrayBuffer();
    return new Response(payload.byteLength ? payload : null, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store, private",
        ...(upstream.headers.get("content-disposition") ? { "Content-Disposition": upstream.headers.get("content-disposition")! } : {}),
      },
    });
  } catch (error) {
    const detail = error instanceof Error && error.name === "AbortError"
      ? "Institutional analytics timed out. No aggregate data was changed."
      : "Institutional analytics is unavailable. Start the LumaPath API and try again.";
    return Response.json({ detail }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timeout);
  }
}
