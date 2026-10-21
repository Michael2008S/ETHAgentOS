import type {Address} from 'viem';
import {DomainError,resolveSkillInput} from './engine.ts';
import {purchaseChoices,type PurchaseChoice} from './purchase-plan.ts';
import {makeSupplierQuoteRequest,verifySupplierQuote} from './supplier-quote.ts';
import {assertVaultSeller,vaultAllowance} from './vault.ts';
import type {OrderSupplier} from './supplier.ts';
import type {AgentIdentity} from './identity.ts';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import type {TaskInput,Workspace} from './types.ts';

export type ExcludedPurchaseChoice={agentId:string;supplierId?:string;reason:'identity-unavailable'|'quote-unavailable'|'quote-rejected'|'over-budget'|'session-denied'|'input-rejected'};
export const MAX_PURCHASE_QUOTES=24;
export type PurchaseQuoteCandidate={agentId:string;identity:AgentIdentity;supplier:OrderSupplier};
/** Compare authenticated offers without mutating the workspace or reserving money. */
export async function quotedPurchaseChoices(state:Workspace,budget:number,context:{
 buyer:Address;payer:Address;workspaceHash:string;deployment:WalletDeployment;input?:TaskInput;vaultSessionId?:string;
 candidates:PurchaseQuoteCandidate[];chainTime:()=>Promise<number>;
}){
 if(!Number.isSafeInteger(budget)||budget<=0||budget>1000000)throw new DomainError('Invalid purchase comparison budget.');
 const excluded:ExcludedPurchaseChoice[]=[],choices:PurchaseChoice[]=[];
 if(!state.policy.active||budget>state.policy.maxTaskBudget)return {choices,excluded};
 const candidates=context.candidates.filter(c=>{const a=state.agents.find(a=>a.id===c.agentId);return a?.enabled&&state.policy.allowedSkills.includes(a.skill)&&c.supplier.descriptor.skills.includes(a.skill);});
 if(candidates.length>MAX_PURCHASE_QUOTES)throw new DomainError('Too many supplier offers to compare. Narrow the authorized catalog.');
 const allowance=(choice:PurchaseChoice,seller?:Address)=>{
  if(!context.vaultSessionId)return;
  const session=vaultAllowance(state,context.vaultSessionId,context.buyer,choice.skill,budget,choice.price);
  assertVaultSeller(session,seller??context.deployment.seller);
 };
 for(const choice of purchaseChoices(state,budget)){
  try{resolveSkillInput(state,choice.skill,context.input);}catch{excluded.push({agentId:choice.agentId,reason:'input-rejected'});continue;}
  try{allowance(choice);choices.push(choice);}catch{excluded.push({agentId:choice.agentId,reason:'session-denied'});}
 }
 // Batches bound network concurrency; failures are explicit, never unsigned hints.
 for(let start=0;start<candidates.length;start+=4){
  const batch=await Promise.all(candidates.slice(start,start+4).map(async candidate=>{
   const {agentId,identity,supplier}=candidate,agent=state.agents.find(a=>a.id===agentId)!,base={agentId,supplierId:supplier.descriptor.id};
   let input:TaskInput;
   try{input=resolveSkillInput(state,agent.skill,context.input);}catch{return {excluded:{...base,reason:'input-rejected'} as ExcludedPurchaseChoice};}
   if(!supplier.quote)return {excluded:{...base,reason:'quote-unavailable'} as ExcludedPurchaseChoice};
   if(context.vaultSessionId){try{const session=state.vaultSessions?.find(s=>s.sessionId===context.vaultSessionId);if(!session||!session.skills.includes(agent.skill))throw new Error();assertVaultSeller(session,identity.wallet);}catch{return {excluded:{...base,reason:'session-denied'} as ExcludedPurchaseChoice};}}
   try{
    const request=await makeSupplierQuoteRequest({...context,requestId:crypto.randomUUID(),agentId,skill:agent.skill,input,identity,supplier:supplier.descriptor});
    const offer=await supplier.quote(request),quote=await verifySupplierQuote(offer,request,supplier.descriptor,await context.chainTime());
    if(quote.payload.priceCents>budget)return {excluded:{...base,reason:'over-budget'} as ExcludedPurchaseChoice};
    const choice:PurchaseChoice={id:agentId+':supplier:'+supplier.descriptor.id,agentId,skill:agent.skill,price:quote.payload.priceCents,executor:'supplier',supplierId:supplier.descriptor.id,supplierConfigHash:supplier.descriptor.configHash,supplierQuote:quote};
    try{allowance(choice,identity.wallet);}catch{return {excluded:{...base,reason:'session-denied'} as ExcludedPurchaseChoice};}
    return {choice};
   }catch(error){return {excluded:{...base,reason:error instanceof DomainError&&error.code==='SUPPLIER_REJECTED'?'quote-rejected':'quote-unavailable'} as ExcludedPurchaseChoice};}
  }));
  for(const item of batch){if(item.choice)choices.push(item.choice);else if(item.excluded)excluded.push(item.excluded);}
 }
 choices.sort((a,b)=>a.id.localeCompare(b.id));return {choices,excluded};
}
