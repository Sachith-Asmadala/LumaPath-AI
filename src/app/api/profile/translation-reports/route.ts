import { proxyProfilePreference } from "@/features/i18n/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return proxyProfilePreference(request, "/v1/profile/preferences/translation-reports"); }
