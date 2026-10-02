import { proxyPortfolio } from "@/features/portfolio/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyPortfolio(request, "/v1/portfolio/projects"); }
export async function POST(request: Request) { return proxyPortfolio(request, "/v1/portfolio/projects"); }
