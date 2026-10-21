import type {Address} from 'viem';
import {DomainError} from './engine.ts';
import type {ChainOrder} from './orders.ts';
/** A supplier's immutable registry wallet is its payee; built-in orders retain the deployment default. */
export function orderSeller(order:Pick<ChainOrder,'executor'|'agentIdentity'|'deployment'>):Address{
 if(order.executor!=='supplier')return order.deployment.seller;
 const wallet=order.agentIdentity?.wallet;
 if(!wallet||!/^0x[0-9a-fA-F]{40}$/.test(wallet)||/^0x0{40}$/.test(wallet))throw new DomainError('Supplier identity requires a nonzero payment wallet.','SUPPLIER_REJECTED');
 return wallet;
}
