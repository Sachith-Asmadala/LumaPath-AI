import { proxyCareerScenarios } from "@/features/career-scenarios/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function POST(request:Request){return proxyCareerScenarios(request,"/v1/career-scenarios");}
