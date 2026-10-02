import { proxySubscription } from "@/features/subscriptions/server/fastapi-proxy";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) { return proxySubscription(request, (await context.params).path.join("/")); }
export async function POST(request: Request, context: Context) { return proxySubscription(request, (await context.params).path.join("/")); }
