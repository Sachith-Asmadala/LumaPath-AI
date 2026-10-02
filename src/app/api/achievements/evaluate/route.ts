import { proxyAchievements } from "@/features/achievements/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function POST(request:Request){ return proxyAchievements(request,"/v1/achievements/evaluate"); }
