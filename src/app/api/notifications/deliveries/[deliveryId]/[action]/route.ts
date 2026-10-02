import { proxyNotifications } from "@/features/notifications/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{deliveryId:string;action:string}>}){const {deliveryId,action}=await params;if(!["opened","dismissed","acted"].includes(action))return Response.json({detail:"Unsupported notification action."},{status:422});return proxyNotifications(request,`/v1/notifications/deliveries/${encodeURIComponent(deliveryId)}/${action}`);}
