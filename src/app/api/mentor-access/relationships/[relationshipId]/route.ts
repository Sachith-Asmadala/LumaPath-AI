import { proxyMentorAccess } from "@/features/mentors/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ relationshipId: string }> }) { const { relationshipId } = await params; return proxyMentorAccess(request, `/v1/mentor-access/relationships/${encodeURIComponent(relationshipId)}`); }
