import { proxyCv } from "@/features/cv/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ documentId: string; suggestionId: string }> }) { const { documentId, suggestionId } = await params; return proxyCv(request, `/v1/cv/documents/${encodeURIComponent(documentId)}/suggestions/${encodeURIComponent(suggestionId)}`); }
