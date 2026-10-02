import { proxyCv } from "@/features/cv/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return proxyCv(request, "/v1/cv/documents/upload"); }
