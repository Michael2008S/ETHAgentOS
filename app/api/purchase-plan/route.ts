import type {SupplierDescriptor} from '@/lib/agentos/supplier';
import { z } from 'zod';
import { owner,checkOrigin } from '@/lib/agentos/auth';
import { read } from '@/lib/agentos/store';
import { purchaseChoices } from '@/lib/agentos/purchase-plan';
import { configuredPurchase } from '@/lib/agentos/model-runtime';
import { configuredOrderChain } from '@/lib/agentos/order-runtime';
import { authorizeSupplier } from '@/lib/agentos/supplier-chain';
import { inspectIdentity } from '@/lib/agentos/identity';
import { apiFailure } from '@/lib/agentos/api-failure';
const schema=z.object({goal:z.string().trim().min(3).max(500),budget:z.number().int().positive().max(1000000)}).strict();
export async function POST(request:Request){try{
 checkOrigin(request);const scope=owner(request);if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415});
 const raw=await request.text();if(new TextEncoder().encode(raw).length>4096)return Response.json({error:'Request too large.'},{status:413});const {goal,budget}=schema.parse(JSON.parse(raw)),snapshot=await read(scope),authorized=new Map<string,SupplierDescriptor[]>();
 try{const configured=await configuredOrderChain(request);for(const identity of snapshot.state.agentIdentities??[]){try{const inspected=await inspectIdentity(configured.client,configured.deployment,identity);for(const supplier of configured.supplier?.suppliers??[]){try{await authorizeSupplier(configured.client,configured.deployment,inspected,supplier.descriptor);authorized.set(identity.agentId,[...(authorized.get(identity.agentId)??[]),supplier.descriptor]);}catch{}}}catch{}}}catch{}
 const choices=purchaseChoices(snapshot.state,budget,authorized),proposal=await configuredPurchase(request,goal,choices);
 return Response.json({proposal:{...proposal,workspaceRevision:snapshot.revision,budget,expiresAt:new Date(Date.now()+300000).toISOString()},choices},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiFailure(error,'runtime');}}
