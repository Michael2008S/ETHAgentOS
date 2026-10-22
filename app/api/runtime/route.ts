import {pendingMixed,mixedDrivesPlugin} from '@/lib/agentos/mixed-workflow';
import {runMixedWorkflow} from '@/lib/agentos/mixed-workflow-runner';
import {mixedStore,configuredMixedRuntime} from '@/lib/agentos/mixed-workflow-runtime';
import {runPluginPurchase} from '@/lib/agentos/plugin-purchase-runner';
import {configuredPluginPurchaseRuntime} from '@/lib/agentos/plugin-purchase-runtime';
import {runPluginJob} from '@/lib/agentos/plugin-runner';
import {pluginDatabase,configuredPluginExecutor} from '@/lib/agentos/plugin-runtime';
import {configuredRepairRuntime} from '@/lib/agentos/workflow-repair-runtime';
import {runWorkflowRepair} from '@/lib/agentos/workflow-repair-runner';
import {repairWorkItems} from '@/lib/agentos/workflow-repair-policy';
import {workflowSupplierAccess} from '@/lib/agentos/workflow-supplier-runtime';
import { owner, checkOrigin, read, execute,updateWorkspace } from '@/lib/agentos/store';
import { runTask, pendingTasks } from '@/lib/agentos/runner';
import { apiFailure } from '@/lib/agentos/api-failure';
import { pendingOrders } from '@/lib/agentos/orders';
import { configuredOrderChain } from '@/lib/agentos/order-runtime';
import { runOrder } from '@/lib/agentos/order-runner';
import {pendingPurchaseRoutes} from '@/lib/agentos/purchase-route-state';
import {runPurchaseRoute} from '@/lib/agentos/purchase-route-runner';
import {purchaseRouteAccess} from '@/lib/agentos/purchase-route-runtime';
import {pendingWorkflows} from '@/lib/agentos/workflows';
import {workflowPublisher} from '@/lib/agentos/workflow-runtime';
import {runWorkflow} from '@/lib/agentos/workflow-runner';
import {workflowDrivesOrder} from '@/lib/agentos/workflow-state';

/** Owner-scoped recovery tick; also usable by the local unattended worker. */
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const ownerId = owner(request), before = await read(ownerId);
    const pending = pendingTasks(before.state).slice(0,16);
    const results = [];
    for (let i=0; i<pending.length; i+=4) results.push(...await Promise.all(pending.slice(i,i+4).map(t => runTask({read,execute},ownerId,t.id,{delayMs:0}))));
    const orderSnapshot=(await read(ownerId)).state,orders=pendingOrders(orderSnapshot).filter(o=>!workflowDrivesOrder(orderSnapshot,o)).slice(0,8),orderResults=[];
    if(orders.length){const {chain,planner,supplier,supplierAuthority,vaultFunder}=await configuredOrderChain(request);for(const order of orders)orderResults.push(await runOrder({read,updateWorkspace},ownerId,order.id,chain,{planner,supplier,supplierAuthority,vaultFunder}));}
    const workflows=pendingWorkflows((await read(ownerId)).state).slice(0,4),workflowResults=[];
    if(workflows.length){const configured=await configuredOrderChain(request);for(const workflow of workflows)workflowResults.push(await runWorkflow({read,updateWorkspace},ownerId,workflow.id,configured.chain,workflowPublisher(configured),{...configured,workflowSuppliers:workflowSupplierAccess(configured,before.scope)}));}
    const routes=pendingPurchaseRoutes((await read(ownerId)).state).slice(0,4),routeResults=[];
    if(routes.length){const configured=await configuredOrderChain(request);for(const route of routes)routeResults.push(await runPurchaseRoute({read,updateWorkspace},ownerId,route.id,purchaseRouteAccess(configured),configured));}
    const repairs=repairWorkItems((await read(ownerId)).state).filter(p=>p.notBefore<=Date.now()).slice(0,2),repairResults=[];
    if(repairs.length){const runtime=await configuredRepairRuntime(request,before.scope);for(const repair of repairs)repairResults.push(await runWorkflowRepair({read,updateWorkspace},ownerId,repair.taskId,runtime));}
    const plugins=((await read(ownerId)).state.pluginJobs??[]).filter(j=>j.status==='queued'||j.status==='running').slice(0,2),pluginResults=[];for(const job of plugins)pluginResults.push(await runPluginJob(pluginDatabase(),ownerId,job.id,()=>configuredPluginExecutor(request)));
    const mixedResults=[];for(const f of pendingMixed((await read(ownerId)).state).slice(0,2))mixedResults.push(await runMixedWorkflow(mixedStore(),ownerId,f.id,()=>configuredMixedRuntime(request,ownerId)));
    const pluginState=(await read(ownerId)).state;
    const pluginPurchases=(pluginState.pluginPurchases??[]).filter(f=>(f.status==='running'||f.status==='cancelling')&&!mixedDrivesPlugin(pluginState,f.id)).slice(0,2),pluginPurchaseResults=[];for(const flow of pluginPurchases)pluginPurchaseResults.push(await runPluginPurchase(pluginDatabase(),ownerId,flow.id,()=>configuredPluginPurchaseRuntime(request)));
    const current = await read(ownerId);
    return Response.json({...current, runtime:{mixedResults,results,orderResults,workflowResults,routeResults,repairResults,pluginResults,pluginPurchaseResults,pending:pendingMixed(current.state).length+(current.state.pluginPurchases??[]).filter(f=>f.status==='running'||f.status==='cancelling').length+(current.state.pluginJobs??[]).filter(j=>j.status==='queued'||j.status==='running').length+repairWorkItems(current.state).length+pendingTasks(current.state).length+pendingOrders(current.state).length+pendingWorkflows(current.state).length+pendingPurchaseRoutes(current.state).length}}, {headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    return apiFailure(error,'runtime');
  }
}
