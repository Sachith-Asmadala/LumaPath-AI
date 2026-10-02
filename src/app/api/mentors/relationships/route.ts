import { proxyMentorStudent } from "@/features/mentors/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyMentorStudent(request, "/v1/mentors/relationships"); }
export async function POST(request: Request) { return proxyMentorStudent(request, "/v1/mentors/relationships"); }
