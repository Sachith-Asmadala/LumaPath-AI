import { proxyCv } from "@/features/cv/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyCv(request, "/v1/cv/documents"); }
