import { proxyEvidenceMentor } from "@/features/evidence-passport/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{requestId:string}>}){const {requestId}=await params;return proxyEvidenceMentor(request,`/v1/evidence-mentor/validation-requests/${encodeURIComponent(requestId)}/respond`);}
