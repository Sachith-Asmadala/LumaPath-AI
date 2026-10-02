import { proxyEvidenceStudent } from "@/features/evidence-passport/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function PUT(request:Request,{params}:{params:Promise<{certificateId:string}>}){const {certificateId}=await params;return proxyEvidenceStudent(request,`/v1/evidence-passport/certificates/${encodeURIComponent(certificateId)}`);}
export async function DELETE(request:Request,{params}:{params:Promise<{certificateId:string}>}){const {certificateId}=await params;return proxyEvidenceStudent(request,`/v1/evidence-passport/certificates/${encodeURIComponent(certificateId)}`);}
