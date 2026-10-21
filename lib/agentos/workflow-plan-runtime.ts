import type {configuredOrderChain} from './order-runtime';
import {workflowPlanChoices,planSession,type PlanParameters} from './workflow-plans';
import type {WorkflowSupplierBinding} from './workflow-suppliers';
import {inspectIdentity} from './identity';
import {authorizeSupplier} from './supplier-chain';
import {assertVaultSeller,checkVaultBinding} from './vault';
import type {Workspace} from './types';
import {DomainError} from './engine';

export async function configuredWorkflowCatalog(configured:Awaited<ReturnType<typeof configuredOrderChain>>,state:Workspace,parameters:PlanParameters,scope:string){
 const session=planSession(state,parameters);if(session.scope!==scope)throw new DomainError('Workflow plan belongs to another workspace.','FORBIDDEN');await checkVaultBinding(configured.client,configured.deployment,session);
 const bindings:WorkflowSupplierBinding[]=[],excluded:{agentId:string;supplierId:string;reason:string}[]=[];
 if(parameters.execution!=='builtin')for(const stored of state.agentIdentities??[]){
  const agent=state.agents.find(a=>a.id===stored.agentId);if(!agent?.enabled||!state.policy.allowedSkills.includes(agent.skill)||!session.skills.includes(agent.skill))continue;
  for(const supplier of configured.supplier?.suppliers??[]){
   if(!supplier.descriptor.skills.includes(agent.skill))continue;
   try{const identity=await inspectIdentity(configured.client,configured.deployment,stored);assertVaultSeller(session,identity.wallet);await authorizeSupplier(configured.client,configured.deployment,identity,supplier.descriptor);bindings.push({identity,supplier:supplier.descriptor});}
   catch{excluded.push({agentId:agent.id,supplierId:supplier.descriptor.id,reason:'identity-or-payee-unavailable'});}
  }
 }
 return {...await workflowPlanChoices(state,parameters,configured.deployment,bindings),excluded};
}
