import { proxyPathways } from "@/features/pathways/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ pathwayId: string }> }) { const { pathwayId } = await params; return proxyPathways(request, `/v1/pathways/${encodeURIComponent(pathwayId)}/decision`); }
