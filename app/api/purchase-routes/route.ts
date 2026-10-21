import {owner,checkOrigin,read,updateWorkspace} from '@/lib/agentos/store';
import {purchaseRouteRequestSchema} from '@/lib/agentos/purchase-route-schema';
import {configuredOrderChain} from '@/lib/agentos/order-runtime';
import {purchaseRouteAccess,schedulePurchaseRoutes} from '@/lib/agentos/purchase-route-runtime';
import {createPurchaseRoute,controlPurchaseRoute,findPurchaseRoute,routeOrderRequestId,validatePurchaseRoute} from '@/lib/agentos/purchase-routes';
import {runPurchaseRoute} from '@/lib/agentos/purchase-route-runner';
import {DomainError,resolveSkillInput} from '@/lib/agentos/engine';
import {inspectIdentity} from '@/lib/agentos/identity';
import {authorizeSupplier} from '@/lib/agentos/supplier-chain';
import {makeSupplierQuoteRequest,supplierQuoteSchema} from '@/lib/agentos/supplier-quote';
import {checkInputSource} from '@/lib/agentos/data-runtime';
import {verifyMemoryAuthority} from '@/lib/agentos/artifact-memory';
import {deferInline} from '@/lib/agentos/auth';
import {apiFailure} from '@/lib/agentos/api-failure';
import type {RouteOffer,PurchaseRouteDraft} from '@/lib/agentos/purchase-route-state';
export async function GET(request:Request){try{const snapshot=await read(owner(request));return Response.json({routes:snapshot.state.purchaseRoutes??[],scope:snapshot.scope},{headers:{'Cache-Control':'no-store'}});}catch(error){return apiFailure(error,'runtime');}}
export async function POST(request:Request){try{
 checkOrigin(request);const ownerId=owner(request);if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415});
 const raw=await request.text();if(new TextEncoder().encode(raw).length>65536)return Response.json({error:'Request too large.'},{status:413});const body=purchaseRouteRequestSchema.parse(JSON.parse(raw));
 if(body.action==='resume'||body.action==='cancel'){const control=body.action;const snapshot=await updateWorkspace(ownerId,state=>controlPurchaseRoute(state,body.routeId,control));if(!deferInline(request))schedulePurchaseRoutes(ownerId,snapshot.state,request);return Response.json({...snapshot,route:findPurchaseRoute(snapshot.state,body.routeId)});}
 const configured=await configuredOrderChain(request),access=purchaseRouteAccess(configured);
 if(body.action==='sync'){await runPurchaseRoute({read,updateWorkspace},ownerId,body.routeId,access,configured);const snapshot=await read(ownerId);return Response.json({...snapshot,route:findPurchaseRoute(snapshot.state,body.routeId)});}
 if(!('requestId' in body))throw new DomainError('Invalid purchase route action.');
 const snapshot=await read(ownerId),{action,...parameters}=body,prior=snapshot.state.purchaseRoutes?.find(r=>r.requestId===body.requestId);
 if(body.action==='create'&&prior){const result=await updateWorkspace(ownerId,state=>createPurchaseRoute(state,parameters as PurchaseRouteDraft,configured.deployment,snapshot.scope,prior.offers,access));if(!deferInline(request))schedulePurchaseRoutes(ownerId,result.state,request);return Response.json({...result,route:findPurchaseRoute(result.state,prior.id)});}
 const session=snapshot.state.vaultSessions?.find(s=>s.sessionId===body.vaultSessionId);if(!session?.signature||session.revokedAt||session.owner.toLowerCase()!==body.buyer.toLowerCase())throw new DomainError('An active owner Vault session is required.','FORBIDDEN');await access.checkSession(session,0);
 const requested=body.action==='prepare'?body.candidates:body.offers;if(new Set(requested.map(c=>c.supplierId)).size!==requested.length)throw new DomainError('Select distinct suppliers for automatic fallback.');
 const offers:RouteOffer[]=[];
 for(const candidate of requested){
  const agent=snapshot.state.agents.find(a=>a.id===candidate.agentId),bound=snapshot.state.agentIdentities?.find(i=>i.agentId===candidate.agentId),supplier=configured.supplier?.selectById(candidate.supplierId);if(!agent?.enabled||!bound||!supplier?.quote)throw new DomainError('Every route service needs a configured authorized supplier.','FORBIDDEN');
  const input=resolveSkillInput(snapshot.state,agent.skill,body.input);await checkInputSource(request,input);await verifyMemoryAuthority(snapshot.state,{input,buyer:body.buyer,deployment:configured.deployment},configured.chain);
  const identity=await inspectIdentity(configured.client,configured.deployment,bound);await authorizeSupplier(configured.client,configured.deployment,identity,supplier.descriptor);
  const context=await makeSupplierQuoteRequest({requestId:await routeOrderRequestId(snapshot.scope,body.requestId,agent.id,candidate.supplierId),workspaceHash:snapshot.scope,buyer:body.buyer,payer:session.vault,agentId:agent.id,skill:agent.skill,input,identity,deployment:configured.deployment,supplier:supplier.descriptor});
  const supplierQuote='supplierQuote' in candidate?supplierQuoteSchema.parse(candidate.supplierQuote):await supplier.quote(context);offers.push({agentId:agent.id,supplierId:candidate.supplierId,supplierQuote,identity,supplier:supplier.descriptor});
 }
 if(body.action==='prepare'&&body.strategy==='lowest-price')offers.sort((a,b)=>a.supplierQuote.payload.priceCents-b.supplierQuote.payload.priceCents||(a.agentId+':'+a.supplierId).localeCompare(b.agentId+':'+b.supplierId));
 const {candidates:_,...base}=parameters as typeof parameters&{candidates?:unknown};const draft={...base,offers:offers.map(({agentId,supplierId,supplierQuote})=>({agentId,supplierId,supplierQuote}))} as PurchaseRouteDraft;
 if(body.action==='prepare'){await validatePurchaseRoute(snapshot.state,draft,configured.deployment,snapshot.scope,offers,access);return Response.json({draft,scope:snapshot.scope},{headers:{'Cache-Control':'no-store'}});}
 const result=await updateWorkspace(ownerId,state=>createPurchaseRoute(state,draft,configured.deployment,snapshot.scope,offers,access));if(!deferInline(request))schedulePurchaseRoutes(ownerId,result.state,request);return Response.json({...result,route:findPurchaseRoute(result.state,'purchase-'+body.requestId)},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiFailure(error,'runtime');}}
