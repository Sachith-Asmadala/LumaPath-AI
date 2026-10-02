import { proxyCareers } from "@/features/career-engine/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function POST(request:Request){return proxyCareers(request,"/v1/careers/pathways/generate");}
