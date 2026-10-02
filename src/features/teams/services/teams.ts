export class TeamApiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "TeamApiError"; }
}

export async function teamRequest<T>(path:string, studentId:string, init?:RequestInit):Promise<T> {
  try {
    const response=await fetch(path,{...init,cache:"no-store",headers:{"X-Luma-Student-Id":studentId,...(init?.body?{"Content-Type":"application/json"}:{}),...(init?.headers??{})}});
    const body=await response.json().catch(()=>({}));
    if(!response.ok) throw new TeamApiError(body?.detail??`Team request failed (${response.status}).`,response.status);
    return body as T;
  } catch(error) {
    if(error instanceof TeamApiError) throw error;
    if(error instanceof DOMException&&error.name==="AbortError") throw new TeamApiError("Team service timed out. No team changes were saved.");
    throw new TeamApiError("Team service is unavailable. No team changes were saved.");
  }
}
