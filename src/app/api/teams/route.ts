import { proxyTeam } from "@/features/teams/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function GET(request:Request){return proxyTeam(request,"/v1/teams");}
export async function POST(request:Request){return proxyTeam(request,"/v1/teams");}
