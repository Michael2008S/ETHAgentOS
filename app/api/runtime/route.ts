import { owner, checkOrigin, read, execute,updateWorkspace } from '@/lib/agentos/store';
import { runTask, pendingTasks } from '@/lib/agentos/runner';
import { apiFailure } from '@/lib/agentos/api-failure';
import { pendingOrders } from '@/lib/agentos/orders';
import { configuredOrderChain } from '@/lib/agentos/order-runtime';
import { runOrder } from '@/lib/agentos/order-runner';
import {pendingWorkflows} from '@/lib/agentos/workflows';
import {workflowPublisher} from '@/lib/agentos/workflow-runtime';
import {runWorkflow} from '@/lib/agentos/workflow-runner';

/** Owner-scoped recovery tick; also usable by the local unattended worker. */
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const ownerId = owner(request), before = await read(ownerId);
    const pending = pendingTasks(before.state).slice(0,16);
    const results = [];
    for (let i=0; i<pending.length; i+=4) results.push(...await Promise.all(pending.slice(i,i+4).map(t => runTask({read,execute},ownerId,t.id,{delayMs:0}))));
    const orders=pendingOrders((await read(ownerId)).state).slice(0,8),orderResults=[];
    if(orders.length){const {chain,planner,supplier,supplierAuthority,vaultFunder}=await configuredOrderChain(request);for(const order of orders)orderResults.push(await runOrder({read,updateWorkspace},ownerId,order.id,chain,{planner,supplier,supplierAuthority,vaultFunder}));}
    const workflows=pendingWorkflows((await read(ownerId)).state).slice(0,4),workflowResults=[];
    if(workflows.length){const configured=await configuredOrderChain(request);for(const workflow of workflows)workflowResults.push(await runWorkflow({read,updateWorkspace},ownerId,workflow.id,configured.chain,workflowPublisher(configured),configured));}
    const current = await read(ownerId);
    return Response.json({...current, runtime:{results,orderResults,workflowResults,pending:pendingTasks(current.state).length+pendingOrders(current.state).length+pendingWorkflows(current.state).length}}, {headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    return apiFailure(error,'runtime');
  }
}
