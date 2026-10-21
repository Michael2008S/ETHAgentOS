import {keccak256,stringToHex,type Hex} from 'viem';
import {canonical,specHash,validateVerification,type DeliverySpec} from '../../cre/workflow/verify.ts';

export type EvidenceEnvironment={BUCKET:R2Bucket;WRITE_TOKEN:string;PUBLIC_ORIGIN:string;ESCROW_ADDRESS:string};
class Fault extends Error{status:number;constructor(status:number,message:string){super(message);this.status=status;}}
const hash=(v:unknown):v is Hex=>typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v);
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function boundedBody(request:Request){
 if(!request.headers.get('content-type')?.includes('application/json'))throw new Fault(415,'JSON required.');
 const reader=request.body?.getReader();if(!reader)throw new Fault(400,'JSON required.');let size=0,text='';const decoder=new TextDecoder();
 try{for(;;){const {value,done}=await reader.read();if(done)break;if((size+=value.length)>131072){await reader.cancel();throw new Fault(413,'Request too large.');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value as Record<string,unknown>;}catch{throw new Fault(400,'Invalid JSON.');}
}
async function writeOnce(bucket:R2Bucket,key:string,bytes:string){
 const written=await bucket.put(key,bytes,{onlyIf:new Headers({'If-None-Match':'*'}),httpMetadata:{contentType:'application/json',cacheControl:'public, max-age=31536000, immutable'}});
 if(!written){const existing=await bucket.get(key);if(!existing)throw new Fault(503,'Evidence write could not be confirmed.');if(await existing.text()!==bytes)throw new Fault(409,'Immutable evidence conflicts with existing bytes.');}
}
async function authenticate(request:Request,token:string){
 if(request.headers.has('origin'))throw new Fault(403,'Evidence writes are server-to-server only.');
 const supplied=request.headers.get('authorization')??'';
 if(token.length<32||!supplied.startsWith('Bearer '))throw new Fault(401,'Evidence writer authentication required.');
 const digest=(s:string)=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
 const [a,b]=await Promise.all([digest(supplied.slice(7)),digest(token)]);let different=0;for(let i=0;i<32;i++)different|=new Uint8Array(a)[i]^new Uint8Array(b)[i];if(different)throw new Fault(401,'Evidence writer authentication required.');
}
export default {async fetch(request:Request,env:EvidenceEnvironment):Promise<Response>{try{
 const origin=new URL(env.PUBLIC_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==env.PUBLIC_ORIGIN||!/^0x[0-9a-fA-F]{40}$/.test(env.ESCROW_ADDRESS)||/^0x0+$/.test(env.ESCROW_ADDRESS))throw new Fault(503,'Evidence service is not configured.');
 const url=new URL(request.url);if(url.origin!==origin.origin||url.search)throw new Fault(400,'Invalid evidence origin or query.');
 const namespace='/v1/11155111/'+env.ESCROW_ADDRESS.toLowerCase(),keyPrefix=namespace.slice(1);
 if(request.method==='GET'){
  if(url.pathname==='/v1/config')return json({version:'agentos.evidence-service.v1',chainId:11155111,escrow:env.ESCROW_ADDRESS.toLowerCase(),publicRead:true});
  const suffix=url.pathname.slice(namespace.length),match=new RegExp('^/(dataset|artifact)/(0x[0-9a-f]{64})$').exec(suffix);
  if(!url.pathname.startsWith(namespace)||!match)return json({error:'Evidence not found.'},404);
  const stored=await env.BUCKET.get(keyPrefix+'/'+match[1]+'/'+match[2]);if(!stored)return json({error:'Evidence not ready.'},404);
  return new Response(stored.body,{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','ETag':stored.httpEtag}});
 }
 if(request.method!=='POST'||!['/v1/drafts','/v1/artifacts'].includes(url.pathname))return json({error:'Method or endpoint not supported.'},405);
 await authenticate(request,env.WRITE_TOKEN);const body=await boundedBody(request);
 if(body.chainId!==11155111||body.escrow!==env.ESCROW_ADDRESS.toLowerCase()||!hash(body.id))throw new Fault(400,'Wrong evidence deployment or task.');
 if(url.pathname==='/v1/drafts'){
  if(Object.keys(body).sort().join(',')!=='chainId,datasetText,escrow,id,verification'||typeof body.datasetText!=='string'||new TextEncoder().encode(body.datasetText).length>65536)throw new Fault(400,'Invalid input evidence.');
  try{validateVerification(body.verification);JSON.parse(body.datasetText);}catch{throw new Fault(400,'Invalid input evidence.');}
  const datasetHash=keccak256(stringToHex(body.datasetText)),spec:DeliverySpec={datasetUrl:origin.origin+namespace+'/dataset/'+datasetHash,artifactUrl:origin.origin+namespace+'/artifact/'+body.id,datasetHash,verification:body.verification};
  await writeOnce(env.BUCKET,keyPrefix+'/dataset/'+datasetHash,body.datasetText);await writeOnce(env.BUCKET,keyPrefix+'/manifest/'+body.id,canonical(spec));return json({spec});
 }
 if(Object.keys(body).sort().join(',')!=='artifactText,chainId,escrow,id,specHash'||typeof body.artifactText!=='string'||new TextEncoder().encode(body.artifactText).length>65536||!hash(body.specHash))throw new Fault(400,'Invalid artifact evidence.');
 const manifest=await env.BUCKET.get(keyPrefix+'/manifest/'+body.id);if(!manifest)throw new Fault(404,'Input commitment not found.');
 const spec=JSON.parse(await manifest.text()) as DeliverySpec;if(specHash(spec)!==body.specHash)throw new Fault(409,'Artifact specification differs from the original commitment.');
 let artifact;try{artifact=JSON.parse(body.artifactText);}catch{throw new Fault(400,'Invalid artifact JSON.');}
 if(artifact?.taskId!==body.id||(!artifact.rejectionReason&&artifact.version!=='agentos.delivery.v2'))throw new Fault(400,'Artifact is not bound to this task.');
 await writeOnce(env.BUCKET,keyPrefix+'/artifact/'+body.id,body.artifactText);return json({stored:true});
}catch(error){return json({error:error instanceof Fault?error.message:'Evidence service is unavailable.'},error instanceof Fault?error.status:503);}}};
