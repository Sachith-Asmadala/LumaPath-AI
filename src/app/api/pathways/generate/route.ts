import { proxyPathways } from "@/features/pathways/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return proxyPathways(request, "/v1/pathways/generate"); }
