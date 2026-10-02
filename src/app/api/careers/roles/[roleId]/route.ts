import { proxyCareers } from "@/features/career-engine/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{roleId:string}>}){const {roleId}=await params;return proxyCareers(request,`/v1/careers/roles/${encodeURIComponent(roleId)}`);}
