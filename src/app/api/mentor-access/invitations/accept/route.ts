import { proxyMentorAccess } from "@/features/mentors/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return proxyMentorAccess(request, "/v1/mentor-access/invitations/accept", false); }
