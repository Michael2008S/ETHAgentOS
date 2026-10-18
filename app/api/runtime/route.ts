import { owner, checkOrigin, read, execute,updateWorkspace } from '@/lib/agentos/store';
import { runTask, pendingTasks } from '@/lib/agentos/runner';
import { DomainError } from '@/lib/agentos/engine';
import { pendingOrders } from '@/lib/agentos/orders';
import { configuredOrderChain } from '@/lib/agentos/order-runtime';
import { runOrder } from '@/lib/agentos/order-runner';

/** Owner-scoped recovery tick; also usable by the local unattended worker. */
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const ownerId = owner(request), before = await read(ownerId);
    const pending = pendingTasks(before.state).slice(0,16);
    const results = [];
    for (let i=0; i<pending.length; i+=4) results.push(...await Promise.all(pending.slice(i,i+4).map(t => runTask({read,execute},ownerId,t.id,{delayMs:0}))));
    const orders=pendingOrders((await read(ownerId)).state).slice(0,8),orderResults=[];
    if(orders.length){const {chain,planner,supplier,supplierAuthority}=await configuredOrderChain(request);for(const order of orders)orderResults.push(await runOrder({read,updateWorkspace},ownerId,order.id,chain,{planner,supplier,supplierAuthority}));}
    const current = await read(ownerId);
    return Response.json({...current, runtime:{results,orderResults,pending:pendingTasks(current.state).length+pendingOrders(current.state).length}}, {headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    const status = error instanceof DomainError ? ({UNAUTHORIZED:401,FORBIDDEN:403,CONFLICT:409}[error.code] ?? 400) : 500;
    return Response.json({error:error instanceof Error ? error.message : 'Runtime tick failed.'},{status});
  }
}
