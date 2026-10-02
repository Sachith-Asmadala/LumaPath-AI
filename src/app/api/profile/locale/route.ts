import { proxyProfilePreference } from "@/features/i18n/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyProfilePreference(request, "/v1/profile/preferences/locale"); }
export async function PUT(request: Request) { return proxyProfilePreference(request, "/v1/profile/preferences/locale"); }
