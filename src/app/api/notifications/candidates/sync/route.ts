import { proxyNotifications } from "@/features/notifications/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function POST(request:Request){return proxyNotifications(request,"/v1/notifications/candidates/sync");}
