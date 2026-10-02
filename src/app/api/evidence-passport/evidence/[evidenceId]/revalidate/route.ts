import { proxyEvidenceStudent } from "@/features/evidence-passport/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{evidenceId:string}>}){const {evidenceId}=await params;return proxyEvidenceStudent(request,`/v1/evidence-passport/evidence/${encodeURIComponent(evidenceId)}/revalidate`);}
