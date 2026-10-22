import {futureWorkflowSteps} from './workflow-state.ts';
import {futureRouteOffers} from './purchase-route-state.ts';
import {pluginPurchaseReservations} from './plugin-purchase-protocol.ts';
import type {Workspace} from './types.ts';
/** Uncreated attempts reserve allowance and order slots alongside workflow steps. */
export function futurePurchaseReservations(state:Workspace){return [
 ...pluginPurchaseReservations(state),
 ...futureWorkflowSteps(state).map(({workflow,step})=>({deployment:workflow.deployment,vaultSessionId:workflow.vaultSessionId,quote:step.quote,budget:step.budget})),
 ...futureRouteOffers(state).map(({route,offer})=>({deployment:route.deployment,vaultSessionId:route.vaultSessionId,quote:offer.supplierQuote.payload.priceCents,budget:offer.supplierQuote.payload.priceCents})),
];}
