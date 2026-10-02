import { proxyEvidenceStudent } from "@/features/evidence-passport/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{shareId:string}>}){const {shareId}=await params;return proxyEvidenceStudent(request,`/v1/evidence-passport/shares/${encodeURIComponent(shareId)}/revoke`);}
