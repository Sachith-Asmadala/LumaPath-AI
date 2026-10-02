import { proxyMentorStudent } from "@/features/mentors/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ relationshipId: string; recommendationId: string }> }) { const { relationshipId, recommendationId } = await params; return proxyMentorStudent(request, `/v1/mentors/relationships/${encodeURIComponent(relationshipId)}/recommendations/${encodeURIComponent(recommendationId)}/decision`); }
