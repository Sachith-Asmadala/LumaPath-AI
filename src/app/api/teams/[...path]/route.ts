import { proxyTeam } from "@/features/teams/server/fastapi-proxy";
export const dynamic="force-dynamic";
type Ctx={params:Promise<{path:string[]}>};
const backend=async(ctx:Ctx)=>`/v1/teams/${(await ctx.params).path.map(encodeURIComponent).join("/")}`;
export async function GET(request:Request,ctx:Ctx){const url=new URL(request.url);return proxyTeam(request,`${await backend(ctx)}${url.search}`);}
export async function POST(request:Request,ctx:Ctx){return proxyTeam(request,await backend(ctx));}
export async function PUT(request:Request,ctx:Ctx){return proxyTeam(request,await backend(ctx));}
export async function DELETE(request:Request,ctx:Ctx){return proxyTeam(request,await backend(ctx));}
