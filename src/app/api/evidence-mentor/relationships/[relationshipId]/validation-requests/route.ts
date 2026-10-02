import { proxyEvidenceMentor } from "@/features/evidence-passport/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{relationshipId:string}>}){const {relationshipId}=await params;return proxyEvidenceMentor(request,`/v1/evidence-mentor/relationships/${encodeURIComponent(relationshipId)}/validation-requests`);}
