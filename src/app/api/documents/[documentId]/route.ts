import { proxyDocuments } from "@/features/documents/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  return proxyDocuments(request, `/v1/documents/${encodeURIComponent(documentId)}`);
}
export async function DELETE(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  return proxyDocuments(request, `/v1/documents/${encodeURIComponent(documentId)}`);
}
