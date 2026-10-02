import { proxyInternships } from "@/features/internships/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request,{params}:{params:Promise<{applicationId:string}>}) { const {applicationId}=await params; return proxyInternships(request,`/v1/internships/applications/${encodeURIComponent(applicationId)}`); }
export async function PUT(request: Request,{params}:{params:Promise<{applicationId:string}>}) { const {applicationId}=await params; return proxyInternships(request,`/v1/internships/applications/${encodeURIComponent(applicationId)}`); }
export async function DELETE(request: Request,{params}:{params:Promise<{applicationId:string}>}) { const {applicationId}=await params; return proxyInternships(request,`/v1/internships/applications/${encodeURIComponent(applicationId)}`); }
