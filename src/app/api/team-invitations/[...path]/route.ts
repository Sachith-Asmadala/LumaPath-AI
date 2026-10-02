import { proxyTeam } from "@/features/teams/server/fastapi-proxy";
export const dynamic="force-dynamic";
type Ctx={params:Promise<{path:string[]}>};
const backend=async(ctx:Ctx)=>`/v1/team-invitations/${(await ctx.params).path.map(encodeURIComponent).join("/")}`;
export async function POST(request:Request,ctx:Ctx){return proxyTeam(request,await backend(ctx));}
