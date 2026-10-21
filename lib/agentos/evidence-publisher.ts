import {canonical,specHash,type DeliverySpec} from '../../cre/workflow/verify.ts';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import type {EvidencePublisher} from './workflows.ts';
import {DomainError} from './engine.ts';

export type EvidenceService={prepare:EvidencePublisher;publish:(id:`0x${string}`,spec:DeliverySpec,artifactText:string)=>Promise<void>};
async function responseText(response:Response,limit:number){
 const reader=response.body?.getReader();if(!reader)throw new DomainError('Evidence service response is empty.','UNAVAILABLE');let text='',size=0;const decoder=new TextDecoder();
 try{for(;;){const {value,done}=await reader.read();if(done)break;if((size+=value.length)>limit){await reader.cancel();throw new DomainError('Evidence service response exceeds its size limit.','UNAVAILABLE');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}return text;
}
export function createEvidenceService(configuration:string,token:string|undefined,deployment:WalletDeployment,request:typeof fetch=fetch):EvidenceService{
 let origin:string;try{const value=JSON.parse(configuration),url=new URL(value.origin);if(Object.keys(value).join(',')!=='origin'||url.protocol!=='https:'||url.origin!==value.origin||deployment.mode!=='testnet'||!deployment.receiver||!token||token.length<32)throw new Error();origin=url.origin;}catch{throw new DomainError('Evidence publishing is not configured.','UNAVAILABLE');}
 const namespace='/v1/'+deployment.chainId+'/'+deployment.escrow.toLowerCase();
 async function call(path:string,body:unknown){
  let response:Response;try{response=await request(origin+path,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({chainId:deployment.chainId,escrow:deployment.escrow.toLowerCase(),...body as object}),signal:AbortSignal.timeout(20000)});}catch{throw new DomainError('Evidence publisher is unavailable. Checkpoint retained.','UNAVAILABLE');}
  if(!response.ok){await response.body?.cancel();throw new DomainError(response.status===409?'Immutable evidence conflicts with existing bytes.':'Evidence publisher is unavailable. Checkpoint retained.',response.status===409?'CONFLICT':'UNAVAILABLE');}
  const text=await responseText(response,16384);try{return JSON.parse(text);}catch{throw new DomainError('Invalid evidence publisher response.','UNAVAILABLE');}
 }
 async function publicRead(url:string,bytes:string){
  let response:Response;try{response=await request(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});}catch{throw new DomainError('Published evidence is not publicly readable.','UNAVAILABLE');}
  if(!response.ok){await response.body?.cancel();throw new DomainError('Published evidence is not publicly readable.','UNAVAILABLE');}
  const text=await responseText(response,65536);
  if(text!==bytes)throw new DomainError('Published evidence differs from committed bytes.','CONFLICT');
 }
 return {
  async prepare(bytes){
   if(!bytes.verification)throw new DomainError('Versioned evidence is required.');
   const expected:DeliverySpec={datasetUrl:origin+namespace+'/dataset/'+bytes.datasetHash,artifactUrl:origin+namespace+'/artifact/'+bytes.id,datasetHash:bytes.datasetHash,verification:bytes.verification},result=await call('/v1/drafts',{id:bytes.id,datasetText:bytes.datasetText,verification:bytes.verification});
   if(canonical(result)!==canonical({spec:expected}))throw new DomainError('Evidence publisher changed the committed specification.','CONFLICT');
   await publicRead(expected.datasetUrl,bytes.datasetText);return expected;
  },
  async publish(id,spec,artifactText){
   if(spec.datasetUrl!==origin+namespace+'/dataset/'+spec.datasetHash||spec.artifactUrl!==origin+namespace+'/artifact/'+id)throw new DomainError('Order evidence differs from the configured publisher.','CONFLICT');
   const result=await call('/v1/artifacts',{id,specHash:specHash(spec),artifactText});if(canonical(result)!==canonical({stored:true}))throw new DomainError('Artifact publication could not be confirmed.','UNAVAILABLE');await publicRead(spec.artifactUrl,artifactText);
  },
 };
}
