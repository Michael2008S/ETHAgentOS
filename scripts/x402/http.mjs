import {createServer} from 'node:http';

export async function readJson(stream,max=131072){let bytes=0;const chunks=[];for await(const chunk of stream){bytes+=chunk.length;if(bytes>max)throw Error('Local x402 request exceeds its bound.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
export async function responseJson(response,max=131072){const reader=response.body?.getReader();if(!reader)throw Error('x402 response has no body.');let size=0,text='';const decoder=new TextDecoder();try{for(;;){const p=await reader.read();if(p.done)break;if((size+=p.value.length)>max)throw Error('x402 response exceeds its bound.');text+=decoder.decode(p.value,{stream:true});}return JSON.parse(text+decoder.decode());}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}
export async function jsonCall(url,body,headers={}){const r=await fetch(url,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const value=await responseJson(r);if(!r.ok)throw Object.assign(Error('Local x402 service refused the request.'),{status:r.status});return value;}
export async function localServer(handler,port=0){
 let base,lastError;const server=createServer(async(req,res)=>{
  const json=(status,value,headers={})=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(value));};
  try{if(req.headers.host!==new URL(base).host||req.headers.origin)return json(403,{error:'Server-to-server local access required.'});await handler(req,json,base);}catch(error){lastError=String(error.shortMessage??error.message).split('\n')[0].slice(0,180);json(error.status??400,{error:'Local x402 request rejected.'});}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});base='http://127.0.0.1:'+server.address().port;
 return {base,lastError:()=>lastError,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
