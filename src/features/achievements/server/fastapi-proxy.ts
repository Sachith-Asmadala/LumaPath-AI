const apiBase=(process.env.LUMAPATH_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/,"");
export async function proxyAchievements(request:Request,backendPath:string){
  const studentId=request.headers.get("x-luma-student-id");
  if(!studentId) return Response.json({detail:"Student identity is required."},{status:401});
  const hasBody=!['GET','HEAD'].includes(request.method); const body=hasBody?await request.arrayBuffer():undefined;
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const upstream=await fetch(`${apiBase}${backendPath}`,{method:request.method,cache:"no-store",signal:controller.signal,headers:{"X-Luma-Student-Id":studentId,...(hasBody?{"Content-Type":request.headers.get("content-type")??"application/json"}:{})},body:body?.byteLength?body:undefined});
    const payload=await upstream.arrayBuffer();
    return new Response(payload.byteLength?payload:null,{status:upstream.status,headers:{"Content-Type":upstream.headers.get("content-type")??"application/json","Cache-Control":"no-store, private"}});
  }catch(error){
    return Response.json({detail:error instanceof Error&&error.name==="AbortError"?"Achievement service timed out. No progress was fabricated.":"Achievement backend is unavailable. Existing work is unchanged."},{status:503,headers:{"Cache-Control":"no-store"}});
  }finally{clearTimeout(timeout);}
}
