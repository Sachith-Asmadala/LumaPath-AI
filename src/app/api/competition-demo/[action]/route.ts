export const dynamic = "force-dynamic";
async function proxy(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (process.env.NODE_ENV === "production" || process.env.LUMAPATH_ENV === "production" || !["GET:status", "POST:reset"].includes(`${request.method}:${action}`)) return Response.json({ detail: "Competition demo is unavailable." }, { status: 404 });
  const id = request.headers.get("x-luma-student-id");
  if (action === "reset" && !id) return Response.json({ detail: "Student identity is required." }, { status: 401 });
  try {
    const base = (process.env.LUMAPATH_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
    const response = await fetch(`${base}/v1/competition-demo/${action}`, { method: request.method, headers: id ? { "X-Luma-Student-Id": id } : {}, cache: "no-store", signal: AbortSignal.timeout(40_000) });
    return new Response(await response.arrayBuffer(), { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store, private" } });
  } catch { return Response.json({ detail: "Competition demo is unavailable. Start the API and retry." }, { status: 503 }); }
}
export const GET = proxy;
export const POST = proxy;
