import type {configuredOrderChain} from './order-runtime';
import type {WorkflowSupplierAccess} from './workflow-suppliers';
import {DomainError} from './engine';
import {inspectIdentity} from './identity';
import {authorizeSupplier} from './supplier-chain';
import {checkVaultBinding} from './vault';
import {centsToToken} from '../../sdk/chain';

export function workflowSupplierAccess(configured:Awaited<ReturnType<typeof configuredOrderChain>>,scope:string):WorkflowSupplierAccess{
 const active=(binding:Parameters<WorkflowSupplierAccess['authorize']>[0])=>{
  if(!configured.supplier)throw new DomainError('Workflow supplier configuration is unavailable.','SUPPLIER_REJECTED');
  return configured.supplier.selectDescriptor(binding.supplier);
 };
 return {
  scope,chainTime:async()=>Number((await configured.client.getBlock()).timestamp),
  bind:async(state,agentId,supplierId)=>{
   const descriptor=configured.supplier?.selectById(supplierId).descriptor,identity=state.agentIdentities?.find(i=>i.agentId===agentId);
   if(!descriptor||!identity)throw new DomainError('Supplier workflows require a registered, delegated service.','SUPPLIER_REJECTED');
   return {supplier:descriptor,identity:await inspectIdentity(configured.client,configured.deployment,identity)};
  },
  authorize:async binding=>{active(binding);await authorizeSupplier(configured.client,configured.deployment,binding.identity,binding.supplier);},
  quote:async(binding,request)=>{const supplier=active(binding);if(!supplier.quote)throw new DomainError('Supplier quote service is unavailable.','UNAVAILABLE');return supplier.quote(request);},
  checkSession:async(session,gross)=>{if(!session.signature||session.revokedAt)throw new DomainError('An active Vault session is required.','FORBIDDEN');const view=await checkVaultBinding(configured.client,configured.deployment,session);if(view.spent+centsToToken(gross,view.decimals)>view.grant[1])throw new DomainError('Remaining onchain daily allowance cannot cover the approved workflow ceilings.','FORBIDDEN');},
 };
}
