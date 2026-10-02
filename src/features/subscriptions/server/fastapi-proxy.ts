const apiBase = (process.env.LUMAPATH_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const routes = new Map([["GET:me", "me"], ["GET:plans", "plans"], ["POST:demo-plan", "demo-plan"], ["POST:automation/authorize", "automation/authorize"]]);

export async function proxySubscription(request: Request, path: string) {
  if (!routes.has(`${request.method}:${path}`)) return Response.json({ detail: "Subscription route not found." }, { status: 404 });
  if (path === "demo-plan" && (process.env.NODE_ENV === "production" || process.env.LUMAPATH_ENV === "production")) return Response.json({ detail: "Demo plan switching is unavailable in production." }, { status: 404 });
  const id = request.headers.get("x-luma-student-id");
  if (!id && path !== "plans") return Response.json({ detail: "Student identity is required." }, { status: 401 });
  try {
    const response = await fetch(`${apiBase}/v1/subscriptions/${path}`, { method: request.method, headers: { ...(id ? { "X-Luma-Student-Id": id } : {}), "Content-Type": "application/json" }, body: request.method === "POST" ? await request.text() || undefined : undefined, cache: "no-store", signal: AbortSignal.timeout(12_000) });
    return new Response(await response.arrayBuffer(), { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store, private" } });
  } catch { return Response.json({ detail: "Plan details are temporarily unavailable." }, { status: 503 }); }
}
