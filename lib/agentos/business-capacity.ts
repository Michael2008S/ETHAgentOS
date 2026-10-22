import {activeHistory} from './business-archives.ts';
import {futureMonitorTickets} from './usdc-monitor-state.ts';
import {mixedPluginRuns} from './mixed-workflow.ts';
import {pendingPluginPurchaseSlots} from './plugin-purchase-protocol.ts';
import {futurePurchaseReservations} from './purchase-reservations.ts';
import type {Workspace} from './types.ts';
export function businessCapacity(state:Workspace,pluginVersions=0){
 const tickets=futureMonitorTickets(state).length,pluginReserved=pendingPluginPurchaseSlots(state)+mixedPluginRuns(state);
 const rows=[
  ['mixed-active',activeHistory(state,'mixed',state.mixedWorkflows??[]).length,tickets,20,'archive'],
  ['monitor-active',activeHistory(state,'monitor',state.usdcMonitors??[]).length,0,10,'archive'],
  ['plugin-purchase-active',activeHistory(state,'plugin-purchase',state.pluginPurchases??[]).length,mixedPluginRuns(state),20,'archive'],
  ['plugin-jobs',(state.pluginJobs??[]).length,pluginReserved,100,'export'],
  ['orders',(state.chainOrders??[]).length,futurePurchaseReservations(state).length,300,'export'],
  ['mixed-retained',(state.mixedWorkflows??[]).length,0,100,'export'],
  ['monitor-retained',(state.usdcMonitors??[]).length,0,100,'export'],
  ['reviews',(state.businessReviews??[]).length,0,200,'export'],
  ['plugin-versions',pluginVersions,0,100,'export'],
 ] as const;
 return rows.map(([key,used,reserved,limit,action])=>({key,used,reserved,limit,remaining:Math.max(0,limit-used-reserved),action,warning:used+reserved>=limit*.8}));
}
export function capacityPreflight(state:Workspace,kind:'mixed'|'monitor',newPlugins:number,newSteps:number,reports=1){
 const capacity=businessCapacity(state),needed:Record<string,number>={'mixed-active':reports,'mixed-retained':reports,'plugin-purchase-active':newPlugins*reports,'plugin-jobs':newPlugins*reports,orders:newSteps*reports};
 if(kind==='monitor'){needed['monitor-active']=1;needed['monitor-retained']=1;}
 const blocked=capacity.filter(row=>(needed[row.key]??0)>row.remaining);
 return {allowed:!blocked.length,blocked,capacity,needed};
}
