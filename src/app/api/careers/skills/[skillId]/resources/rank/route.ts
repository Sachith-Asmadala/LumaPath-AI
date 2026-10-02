import { proxyCareers } from "@/features/career-engine/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{skillId:string}>}){const {skillId}=await params;return proxyCareers(request,`/v1/careers/skills/${encodeURIComponent(skillId)}/resources/rank`);}
