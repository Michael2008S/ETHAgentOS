import {configuredOrderChain} from './order-runtime';
import {workflowPlanningModel} from './model-runtime';
import {configuredWorkflowCatalog} from './workflow-plan-runtime';
import {workflowSupplierAccess} from './workflow-supplier-runtime';
import {planSession} from './workflow-plans';
import type {RepairRuntime} from './workflow-repair-runner';
export async function configuredRepairRuntime(request:Request,scope:string):Promise<RepairRuntime>{
 const configured=await configuredOrderChain(request),model=workflowPlanningModel(request),access=workflowSupplierAccess(configured,scope);
 return {scope,deployment:configured.deployment,chain:configured.chain,model,catalog:(state,p)=>configuredWorkflowCatalog(configured,state,p,scope),checkSession:async(state,p,gross)=>{const session=planSession(state,p);if(session.scope!==scope)throw Error('Invalid repair scope');await access.checkSession(session,gross);}};
}
