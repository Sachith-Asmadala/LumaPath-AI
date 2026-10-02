import { proxyCareerScenarios } from "@/features/career-scenarios/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function GET(request:Request){return proxyCareerScenarios(request,"/v1/career-scenarios/saved");}
