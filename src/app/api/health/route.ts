import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    service: "LumaPath AI prototype backend",
    status: "ok",
    capabilities: ["learning-recommendations", "resource-filtering"],
  });
}
