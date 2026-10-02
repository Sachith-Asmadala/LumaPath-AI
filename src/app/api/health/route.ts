import { NextResponse } from "next/server";
import { releaseVersion } from "@/lib/release";

export async function GET() {
  try {
    const base = (process.env.LUMAPATH_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
    const response = await fetch(`${base}/health`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const body = await response.json();
    if (!response.ok || body.status !== "healthy" || body.version !== releaseVersion) throw new Error("Backend health could not be verified.");
    return NextResponse.json({ status: "healthy", version: releaseVersion }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded", version: releaseVersion }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
