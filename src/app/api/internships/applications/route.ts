import { proxyInternships } from "@/features/internships/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyInternships(request, "/v1/internships/applications"); }
export async function POST(request: Request) { return proxyInternships(request, "/v1/internships/applications"); }
