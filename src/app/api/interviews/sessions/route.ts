import { proxyInterviews } from "@/features/interviews/server/fastapi-proxy";
export async function GET(request:Request){return proxyInterviews(request,"/v1/interviews/sessions");}
export async function POST(request:Request){return proxyInterviews(request,"/v1/interviews/sessions");}
