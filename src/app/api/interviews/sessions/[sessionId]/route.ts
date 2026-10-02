import { proxyInterviews } from "@/features/interviews/server/fastapi-proxy";
export async function GET(request:Request,{params}:{params:Promise<{sessionId:string}>}){const {sessionId}=await params;return proxyInterviews(request,`/v1/interviews/sessions/${encodeURIComponent(sessionId)}`);}
export async function DELETE(request:Request,{params}:{params:Promise<{sessionId:string}>}){const {sessionId}=await params;return proxyInterviews(request,`/v1/interviews/sessions/${encodeURIComponent(sessionId)}`);}
