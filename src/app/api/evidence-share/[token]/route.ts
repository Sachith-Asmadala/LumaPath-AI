import { proxyEvidencePublic } from "@/features/evidence-passport/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){const {token}=await params;return proxyEvidencePublic(request,`/v1/evidence-share/${encodeURIComponent(token)}`);}
