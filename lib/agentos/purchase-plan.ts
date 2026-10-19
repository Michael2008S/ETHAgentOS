import { digest,DomainError } from './engine.ts';
import { modelDescriptor,type ModelConfiguration } from './model.ts';
import type { Workspace,Skill } from './types.ts';
export type PurchaseChoice={id:string;agentId:string;skill:Skill;price:number;executor:'builtin'|'supplier'};
export function purchaseChoices(state:Workspace,budget:number,supplierAgents:ReadonlySet<string>=new Set()):PurchaseChoice[]{
 if(!state.policy.active||budget>state.policy.maxTaskBudget)return [];
 return state.agents.filter(a=>a.enabled&&state.policy.allowedSkills.includes(a.skill)&&a.price<=budget).flatMap(a=>['builtin',...(supplierAgents.has(a.id)?['supplier']:[])].map(executor=>({id:a.id+':'+executor,agentId:a.id,skill:a.skill,price:a.price,executor:executor as 'builtin'|'supplier'})));
}
export function validatePurchasePlan(raw:unknown,choices:PurchaseChoice[]){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new DomainError('Invalid purchase suggestion.');
 const p=raw as Record<string,unknown>,choice=choices.find(c=>c.id===p.choiceId);
 if(Object.keys(p).sort().join(',')!=='choiceId,reason'||!choice||!['lowest-price','allocation-report','event-summary'].includes(String(p.reason)))throw new DomainError('Model selected a service outside the authorized catalog.');
 if(p.reason==='lowest-price'&&choice.price!==Math.min(...choices.filter(c=>c.executor===choice.executor).map(c=>c.price))||p.reason==='allocation-report'&&choice.skill!=='treasury-report'||p.reason==='event-summary'&&choice.skill!=='event-analysis')throw new DomainError('Model suggestion reason does not match the selected service.');
 return {choice,reason:p.reason as string};
}
export async function proposePurchase(config:ModelConfiguration,key:string|undefined,goal:string,choices:PurchaseChoice[],request:typeof fetch=fetch){
 if(!choices.length)throw new DomainError('No authorized service fits this budget.');
 const instructions='Classify the purchase goal into one intent: lowest-price (explicitly wants cheapest/affordable), allocation-report (treasury breakdown per recipient), event-summary (event count/totals). Choose executor supplier only when independent signed delivery is requested, otherwise builtin. The runtime, not you, computes prices and selects the cheapest eligible service. Return only intent and executor.';
 const body={model:config.model,temperature:0,max_tokens:128,stream:false,messages:[{role:'system',content:instructions},{role:'user',content:'Pick the most affordable service.'},{role:'assistant',content:'{"intent":"lowest-price","executor":"builtin"}'},{role:'user',content:'Break down treasury spending per recipient.'},{role:'assistant',content:'{"intent":"allocation-report","executor":"builtin"}'},{role:'user',content:'Task: '+goal+'\nReply with JSON intent and executor.'}],response_format:{type:'json_object'}};
 const response=await request(config.url,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(config.timeoutMs)}).catch(()=>{throw new DomainError('Model inference is unavailable. No purchase was created.','UNAVAILABLE');});
 if(!response.ok){await response.body?.cancel();throw new DomainError('Model inference is unavailable. No purchase was created.','UNAVAILABLE');}
 const reader=response.body?.getReader();if(!reader)throw new DomainError('Invalid purchase suggestion.');let text='',size=0;const decoder=new TextDecoder();
 try{for(;;){const {done,value}=await reader.read();if(done)break;if((size+=value.length)>65536){await reader.cancel();throw new DomainError('Purchase suggestion exceeds the size limit.');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 let envelope,parsed;try{envelope=JSON.parse(text);if(envelope.choices?.[0]?.finish_reason!=='stop')throw new Error();parsed=JSON.parse(envelope.choices[0].message.content);}catch{throw new DomainError('Invalid purchase suggestion.');}
 if(!parsed||Object.keys(parsed).sort().join(',')!=='executor,intent'||!['lowest-price','allocation-report','event-summary'].includes(parsed.intent)||!['builtin','supplier'].includes(parsed.executor))throw new DomainError('Invalid purchase suggestion.');
 const eligible=choices.filter(c=>c.executor===parsed.executor&&(parsed.intent!=='allocation-report'||c.skill==='treasury-report')&&(parsed.intent!=='event-summary'||c.skill==='event-analysis')).sort((a,b)=>a.price-b.price||a.id.localeCompare(b.id));
 if(!eligible.length)throw new DomainError('No authorized service fits this budget.');
 return {...validatePurchasePlan({choiceId:eligible[0].id,reason:parsed.intent},choices),model:await modelDescriptor(config),promptHash:await digest(body),responseHash:await digest(text),catalogHash:await digest(choices),generatedAt:new Date().toISOString()};
}
