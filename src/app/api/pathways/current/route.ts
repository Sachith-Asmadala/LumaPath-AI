import { proxyPathways } from "@/features/pathways/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyPathways(request, "/v1/pathways/current"); }
