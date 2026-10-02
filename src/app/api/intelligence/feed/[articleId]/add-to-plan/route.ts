import { proxyIntelligence } from "@/features/intelligence/server/fastapi-proxy";
export async function POST(request: Request, { params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = await params;
  return proxyIntelligence(request, `/v1/intelligence/feed/${encodeURIComponent(articleId)}/add-to-plan`);
}
