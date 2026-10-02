import { proxyEvidenceStudent } from "@/features/evidence-passport/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function GET(request:Request){return proxyEvidenceStudent(request,"/v1/evidence-passport/access-history");}
