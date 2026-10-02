import { proxyInternships } from "@/features/internships/server/fastapi-proxy";
export async function POST(request:Request,{params}:{params:Promise<{applicationId:string}>}) { const {applicationId}=await params; return proxyInternships(request,`/v1/internships/applications/${encodeURIComponent(applicationId)}/reminders`); }
