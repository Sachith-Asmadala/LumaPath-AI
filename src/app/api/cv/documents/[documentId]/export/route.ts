import { proxyCv } from "@/features/cv/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) { const { documentId } = await params; return proxyCv(request, `/v1/cv/documents/${encodeURIComponent(documentId)}/export`); }
