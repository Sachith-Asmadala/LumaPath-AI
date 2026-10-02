import { proxyMentorStudent } from "@/features/mentors/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ relationshipId: string }> }) { const { relationshipId } = await params; return proxyMentorStudent(request, `/v1/mentors/relationships/${encodeURIComponent(relationshipId)}/revoke`); }
