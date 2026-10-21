import {z} from 'zod';
import {owner,checkOrigin,read} from '@/lib/agentos/store';
import {DomainError,resolveSkillInput} from '@/lib/agentos/engine';
import {chainOrderInputSchema} from '@/lib/agentos/order-input-schema';
import {configuredOrderChain} from '@/lib/agentos/order-runtime';
import {inspectIdentity} from '@/lib/agentos/identity';
import {authorizeSupplier} from '@/lib/agentos/supplier-chain';
import {makeSupplierQuoteRequest,verifySupplierQuote} from '@/lib/agentos/supplier-quote';
import {assertVaultSeller,checkVaultBinding} from '@/lib/agentos/vault';
import {verifyMemoryAuthority} from '@/lib/agentos/artifact-memory';
import {checkInputSource} from '@/lib/agentos/data-runtime';
import {apiFailure} from '@/lib/agentos/api-failure';
const schema=z.object({requestId:z.string().uuid(),agentId:z.string().min(1).max(128),supplierId:z.string().regex(/^[a-z0-9-]{1,64}$/),buyer:z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(v=>v as `0x${string}`),input:chainOrderInputSchema.optional(),vaultSessionId:z.string().uuid().optional()}).strict();
/** Signed offers contain commitments only; requesting a quote cannot create a job or payment. */
export async function POST(request:Request){try{
 checkOrigin(request);const ownerId=owner(request);if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415});
 const raw=await request.text();if(new TextEncoder().encode(raw).length>65536)return Response.json({error:'Request too large.'},{status:413});const body=schema.parse(JSON.parse(raw)),snapshot=await read(ownerId),agent=snapshot.state.agents.find(a=>a.id===body.agentId);
 if(!agent?.enabled||!snapshot.state.policy.active||!snapshot.state.policy.allowedSkills.includes(agent.skill))throw new DomainError('An authorized enabled service is required.','FORBIDDEN');
 const input=resolveSkillInput(snapshot.state,agent.skill,body.input),configured=await configuredOrderChain(request),supplier=configured.supplier?.selectById(body.supplierId),bound=snapshot.state.agentIdentities?.find(i=>i.agentId===body.agentId);
 if(!supplier?.quote||!bound)throw new DomainError('Signed quoting requires a configured, identity-bound supplier.','UNAVAILABLE');
 const identity=await inspectIdentity(configured.client,configured.deployment,bound);await authorizeSupplier(configured.client,configured.deployment,identity,supplier.descriptor);
 let payer=body.buyer;
 if(body.vaultSessionId){const session=snapshot.state.vaultSessions?.find(s=>s.sessionId===body.vaultSessionId);if(!session?.signature||session.revokedAt||session.owner.toLowerCase()!==body.buyer.toLowerCase()||!session.skills.includes(agent.skill))throw new DomainError('No active Vault session authorizes this purchase.','FORBIDDEN');await checkVaultBinding(configured.client,configured.deployment,session);assertVaultSeller(session,identity.wallet);payer=session.vault;}
 await checkInputSource(request,input);await verifyMemoryAuthority(snapshot.state,{input,buyer:body.buyer,deployment:configured.deployment},configured.chain);
 const context=await makeSupplierQuoteRequest({requestId:body.requestId,workspaceHash:snapshot.scope,buyer:body.buyer,payer,agentId:agent.id,skill:agent.skill,input,identity,deployment:configured.deployment,supplier:supplier.descriptor}),offer=await supplier.quote(context),quote=await verifySupplierQuote(offer,context,supplier.descriptor,Number((await configured.client.getBlock()).timestamp));
 return Response.json({quote,supplier:supplier.descriptor,identity,scope:snapshot.scope},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiFailure(error,'runtime');}}
