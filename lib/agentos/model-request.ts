/** Pin controller-owned local models until their complete bounded response is read. */
export async function leasedModelRequest(url:string,init:RequestInit,request:typeof fetch=fetch){
 const names:Record<string,string>={'http://127.0.0.1:11435':'base','http://127.0.0.1:11436':'planning','http://127.0.0.1:11437':'memory'},model=names[new URL(url).origin];
 if(!model)return request(url,init);
 const leaseId=crypto.randomUUID(),control=async(action:string)=>{try{await fetch('http://127.0.0.1:6100/models',{method:'POST',headers:{'Content-Type':'application/json','x-agentos-model-control':'agentos-local-v1'},body:JSON.stringify({action,model,leaseId}),signal:AbortSignal.timeout(2000)});}catch{/* Standalone unowned models remain usable. */}};
 await control('acquire');const heartbeat=setInterval(()=>void control('acquire'),30000);
 try{const response=await request(url,init),reader=response.body?.getReader();if(!reader)return response;const chunks:Uint8Array[]=[];let length=0;try{for(;;){const p=await reader.read();if(p.done)break;length+=p.value.length;if(length>1048576){await reader.cancel();throw Error('Local model response exceeds its bound.');}chunks.push(p.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers});}
 finally{clearInterval(heartbeat);await control('release');}
}
