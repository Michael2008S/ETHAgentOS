import { z } from 'zod';
import { owner,checkOrigin } from '@/lib/agentos/auth';
import { read } from '@/lib/agentos/store';
import { purchaseChoices } from '@/lib/agentos/purchase-plan';
import { configuredPurchase } from '@/lib/agentos/model-runtime';
import { configuredOrderChain } from '@/lib/agentos/order-runtime';
import { authorizeSupplier } from '@/lib/agentos/supplier-chain';
import { inspectIdentity } from '@/lib/agentos/identity';
import { apiFailure } from '@/lib/agentos/api-failure';
import {quotedPurchaseChoices,type ExcludedPurchaseChoice,type PurchaseQuoteCandidate} from '@/lib/agentos/purchase-quotes';
import {chainOrderInputSchema} from '@/lib/agentos/order-input-schema';
import {normalizeInput,DomainError} from '@/lib/agentos/engine';
import {checkInputSource} from '@/lib/agentos/data-runtime';
import {verifyMemoryAuthority} from '@/lib/agentos/artifact-memory';
import {checkVaultBinding} from '@/lib/agentos/vault';
import {assertQuoteTime} from '@/lib/agentos/supplier-quote';
const schema=z.object({goal:z.string().trim().min(3).max(500),budget:z.number().int().positive().max(1000000),buyer:z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(v=>!/^0x0{40}$/.test(v)).transform(v=>v as `0x${string}`).optional(),input:chainOrderInputSchema.optional(),vaultSessionId:z.string().uuid().optional()}).strict().refine(v=>!v.vaultSessionId||!!v.buyer);
export async function POST(request:Request){try{
 checkOrigin(request);const scope=owner(request);if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415});
 const raw=await request.text();if(new TextEncoder().encode(raw).length>65536)return Response.json({error:'Request too large.'},{status:413});const {goal,budget,buyer,input,vaultSessionId}=schema.parse(JSON.parse(raw)),snapshot=await read(scope);
 const excluded:ExcludedPurchaseChoice[]=[];let choices=purchaseChoices(snapshot.state,budget),chainTime:(()=>Promise<number>)|undefined;
 // Legacy calls without a wallet compare built-ins only; no unsigned supplier price is eligible.
 if(buyer){
  const configured=await configuredOrderChain(request),candidates:PurchaseQuoteCandidate[]=[];let payer=buyer;
  if(vaultSessionId){const session=snapshot.state.vaultSessions?.find(s=>s.sessionId===vaultSessionId);if(!session?.signature||session.revokedAt||session.owner.toLowerCase()!==buyer.toLowerCase())throw new DomainError('No active Vault session authorizes this purchase.','FORBIDDEN');await checkVaultBinding(configured.client,configured.deployment,session);payer=session.vault;}
  const normalized=normalizeInput(input);await checkInputSource(request,normalized);await verifyMemoryAuthority(snapshot.state,{input:normalized,buyer,deployment:configured.deployment},configured.chain);
  for(const identity of snapshot.state.agentIdentities??[]){
   const agent=snapshot.state.agents.find(a=>a.id===identity.agentId);if(!agent?.enabled||!snapshot.state.policy.allowedSkills.includes(agent.skill))continue;
   const suppliers=(configured.supplier?.suppliers??[]).filter(s=>s.descriptor.skills.includes(agent.skill));
   try{const inspected=await inspectIdentity(configured.client,configured.deployment,identity);for(const supplier of suppliers){try{await authorizeSupplier(configured.client,configured.deployment,inspected,supplier.descriptor);candidates.push({agentId:identity.agentId,identity:inspected,supplier});}catch{excluded.push({agentId:identity.agentId,supplierId:supplier.descriptor.id,reason:'identity-unavailable'});}}}catch{for(const supplier of suppliers)excluded.push({agentId:identity.agentId,supplierId:supplier.descriptor.id,reason:'identity-unavailable'});}
  }
  chainTime=async()=>Number((await configured.client.getBlock()).timestamp);
  const catalog=await quotedPurchaseChoices(snapshot.state,budget,{buyer,payer,workspaceHash:snapshot.scope,deployment:configured.deployment,input,vaultSessionId,candidates,chainTime});choices=catalog.choices;excluded.push(...catalog.excluded);
 }
 const proposal=await configuredPurchase(request,goal,choices);let validForMs=300000;
 if(proposal.choice.supplierQuote){const now=await chainTime!();assertQuoteTime(proposal.choice.supplierQuote,now);validForMs=Math.min(validForMs,(proposal.choice.supplierQuote.payload.expiresAt-now)*1000);}
 return Response.json({proposal:{...proposal,workspaceRevision:snapshot.revision,budget,expiresAt:new Date(Date.now()+validForMs).toISOString()},choices,excluded,comparison:'verified-responding-offers'},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiFailure(error,'runtime');}}
