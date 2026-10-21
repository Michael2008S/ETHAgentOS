import {after} from 'next/server';
import * as store from './store';
import {configuredOrderChain} from './order-runtime';
import {workflowPublisher} from './workflow-runtime';
import {authorizeSupplier} from './supplier-chain';
import {checkVaultBinding} from './vault';
import {centsToToken} from '../../sdk/chain';
import {DomainError} from './engine';
import {pendingPurchaseRoutes} from './purchase-route-state';
import {runPurchaseRoute} from './purchase-route-runner';
import type {RouteAccess} from './purchase-routes';
import type {Workspace} from './types';
export function purchaseRouteAccess(configured:Awaited<ReturnType<typeof configuredOrderChain>>):RouteAccess{return {
 chain:configured.chain,publish:workflowPublisher(configured),chainTime:async()=>Number((await configured.client.getBlock()).timestamp),
 authorize:async offer=>{const active=configured.supplier?.selectById(offer.supplierId);if(!active||active.descriptor.configHash!==offer.supplier.configHash)throw new DomainError('Reviewed supplier configuration is unavailable.','SUPPLIER_REJECTED');await authorizeSupplier(configured.client,configured.deployment,offer.identity,offer.supplier);},
 checkSession:async(session,gross)=>{if(!session.signature||session.revokedAt)throw new DomainError('An active Vault session is required.','FORBIDDEN');const view=await checkVaultBinding(configured.client,configured.deployment,session);if(view.spent+(gross===0?0n:centsToToken(gross,view.decimals))>view.grant[1])throw new DomainError('Remaining onchain daily allowance cannot cover the approved attempts.','FORBIDDEN');},
};}
export function schedulePurchaseRoutes(ownerId:string,state:Workspace,request:Request){const routes=pendingPurchaseRoutes(state).slice(0,4);if(!routes.length)return;after(async()=>{try{const configured=await configuredOrderChain(request),access=purchaseRouteAccess(configured);for(const route of routes)await runPurchaseRoute(store,ownerId,route.id,access,configured);}catch{console.error('[agentos] Purchase route awaits durable recovery.');}});}
