import {leasedModelRequest} from './model-request.ts';
import {canonical} from '../../cre/workflow/verify.ts';
import {digest,DomainError} from './engine.ts';
export type EmbeddingConfiguration={url:string;model:string;revision:string;timeoutMs:number;inputDimensions:number;dimensions:number};
export type EmbeddingDescriptor={provider:'embeddings';model:string;revision:string;inputDimensions:number;dimensions:number;configHash:string};
export const MEMORY_QUERY_INSTRUCTION='Given a question, retrieve relevant private AgentOS task records, paid results or knowledge notes.';
export function parseEmbeddingConfiguration(raw:unknown,local=false):EmbeddingConfiguration{
 const v=raw as EmbeddingConfiguration;
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='dimensions,inputDimensions,model,revision,timeoutMs,url'||typeof v.model!=='string'||!v.model.trim()||v.model.length>128||typeof v.revision!=='string'||!v.revision||v.revision.length>128)throw new DomainError('Memory embedding configuration is unavailable.','UNAVAILABLE');
 let url:URL;try{url=new URL(v.url);}catch{throw new DomainError('Memory embedding endpoint is unavailable.','UNAVAILABLE');}
 if(url.username||url.password||url.search||url.hash||url.protocol!=='https:'&&!(local&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))||!url.pathname.endsWith('/embeddings')||!Number.isSafeInteger(v.timeoutMs)||v.timeoutMs<1000||v.timeoutMs>60000||!Number.isSafeInteger(v.inputDimensions)||v.inputDimensions<32||v.inputDimensions>4096||!Number.isSafeInteger(v.dimensions)||v.dimensions<32||v.dimensions>1024||v.dimensions>v.inputDimensions)throw new DomainError('Invalid memory embedding resource limits.','UNAVAILABLE');return {...v,url:url.href};
}
export async function embeddingDescriptor(c:EmbeddingConfiguration):Promise<EmbeddingDescriptor>{return {provider:'embeddings',model:c.model,revision:c.revision,inputDimensions:c.inputDimensions,dimensions:c.dimensions,configHash:await digest({protocol:'agentos.semantic-embedding.v1',...c,queryInstruction:MEMORY_QUERY_INSTRUCTION,projection:'prefix-float32-unit-normalized'})};}
export function normalizedVector(value:unknown,dimensions:number){
 if(!Array.isArray(value)||value.length<dimensions||value.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e10))throw new DomainError('Invalid memory embedding response.','UNAVAILABLE');const part=value.slice(0,dimensions) as number[],norm=Math.sqrt(part.reduce((n,v)=>n+v*v,0));if(!Number.isFinite(norm)||norm<1e-12)throw new DomainError('Invalid memory embedding response.','UNAVAILABLE');return part.map(v=>Math.fround(v/norm));
}
export function cosineSimilarity(a:number[],b:number[]){if(a.length!==b.length||a.some(v=>!Number.isFinite(v))||b.some(v=>!Number.isFinite(v)))throw new DomainError('Memory vector index is inconsistent.','UNAVAILABLE');return Math.max(-1,Math.min(1,a.reduce((n,v,i)=>n+v*b[i],0)));}
export async function embedMemory(c:EmbeddingConfiguration,key:string|undefined,texts:string[],requestId:string,query=false,request:typeof fetch=fetch){
 if(!texts.length||texts.length>8||texts.some(t=>typeof t!=='string'||!t.trim()||t.length>2400)||texts.reduce((n,t)=>n+t.length,0)>6000)throw new DomainError('Index at most eight summaries and 6000 characters per batch.');
 const input=texts.map(t=>query?'Instruct: '+MEMORY_QUERY_INSTRUCTION+'\nQuery:'+t:t);let response:Response;
 try{response=await leasedModelRequest(c.url,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','Idempotency-Key':requestId,...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify({model:c.model,input,encoding_format:'float'}),signal:AbortSignal.timeout(c.timeoutMs)},request);}catch{throw new DomainError('Memory embedding service is unavailable. No purchase was created.','UNAVAILABLE');}
 if(!response.ok){await response.body?.cancel();throw new DomainError('Memory embedding service is unavailable. No purchase was created.','UNAVAILABLE');}
 const reader=response.body?.getReader();if(!reader)throw new DomainError('Invalid memory embedding response.','UNAVAILABLE');let text='',size=0;const decoder=new TextDecoder();try{for(;;){const r=await reader.read();if(r.done)break;if((size+=r.value.length)>2000000){await reader.cancel();throw new Error();}text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();}catch{throw new DomainError('Invalid memory embedding response.','UNAVAILABLE');}finally{reader.releaseLock();}
 try{const data=JSON.parse(text);if(data.model!==c.model||!Array.isArray(data.data)||data.data.length!==texts.length||new Set(data.data.map((v:{index:number})=>v.index)).size!==texts.length)throw new Error();return texts.map((_,index)=>{const row=data.data.find((v:{index:number})=>v.index===index);if(!row||!Array.isArray(row.embedding)||row.embedding.length!==c.inputDimensions)throw new Error();return normalizedVector(row.embedding,c.dimensions);});}catch{throw new DomainError('Invalid memory embedding response.','UNAVAILABLE');}
}
export const sameEmbedding=(a:EmbeddingDescriptor,b:EmbeddingDescriptor)=>canonical(a)===canonical(b);
