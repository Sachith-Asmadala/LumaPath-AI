import { proxyInternships } from "@/features/internships/server/fastapi-proxy";
export async function PUT(request:Request,{params}:{params:Promise<{applicationId:string;reminderId:string}>}) { const {applicationId,reminderId}=await params; return proxyInternships(request,`/v1/internships/applications/${encodeURIComponent(applicationId)}/reminders/${encodeURIComponent(reminderId)}`); }
