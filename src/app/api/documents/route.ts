import { proxyDocuments } from "@/features/documents/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyDocuments(request, "/v1/documents"); }
export async function POST(request: Request) { return proxyDocuments(request, "/v1/documents"); }
