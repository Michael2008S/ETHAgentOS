import {localServices} from './local-services';
import { env } from 'cloudflare:workers';
import { after } from 'next/server';
import { serverChain } from './chain-config';
import { orderChain } from './order-chain';
import { pendingOrders } from './orders';
import { runOrder } from './order-runner';
import * as store from './store';
import type { Workspace } from './types';
import { DomainError } from './engine';
import { configuredPlanner } from './model-runtime';
import { configuredSupplier } from './supplier-runtime';
import { authorizeSupplier } from './supplier-chain';
import type { ChainOrder } from './orders';
import {vaultFunder,privateVaultSender} from './vault-executor';
import {createEvidenceService} from './evidence-publisher';
import {workflowDrivesOrder} from './workflow-state';
export async function configuredOrderChain(request:Request){
  const {client,deployment,rpcUrl}=await serverChain(request,env.AGENTOS_CHAIN_CONFIGURATION).catch(error=>{if(error instanceof DomainError)throw error;throw new DomainError('Onchain configuration is unavailable.','UNAVAILABLE');});
  const localCall=deployment.mode==='local'?async<T={hash:`0x${string}`}>(path:string,body:unknown):Promise<T>=>{
    const response=await fetch(localServices().chain+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    const data=await response.json() as T & {error?:string};if(!response.ok)throw new Error(data.error??'Local order settlement failed.');return data;
  }:undefined;
  const supplierAuthority=async(order:ChainOrder)=>{if(!order.agentIdentity||!order.supplier)throw new DomainError('Supplier execution requires an identity-bound order.','SUPPLIER_REJECTED');await authorizeSupplier(client,deployment,order.agentIdentity,order.supplier);};
  const funder=deployment.vault?vaultFunder(client,deployment,localCall?async(order)=>{const result=await localCall('/vault-fund',{order});return result.hash;}:env.AGENTOS_VAULT_EXECUTOR_PRIVATE_KEY?async(order,data)=>privateVaultSender(client,deployment,rpcUrl,env.AGENTOS_VAULT_EXECUTOR_PRIVATE_KEY!)(order,data):async()=>{throw new DomainError('Vault executor is not configured.','UNAVAILABLE');}):undefined;
  const evidence=deployment.mode==='testnet'&&env.AGENTOS_EVIDENCE_CONFIGURATION?createEvidenceService(env.AGENTOS_EVIDENCE_CONFIGURATION,env.AGENTOS_EVIDENCE_WRITE_TOKEN,deployment):undefined;
  return {evidence,vaultFunder:funder,supplierAuthority,client,chain:orderChain(client,deployment,localCall,evidence?.publish,evidence?.complete),deployment,localCall,planner:await configuredPlanner(request).catch(()=>undefined),supplier:await configuredSupplier(request,client,deployment).catch(()=>undefined)};
}
export function scheduleOrders(ownerId:string,state:Workspace,request:Request){
  const orders=pendingOrders(state).filter(o=>!workflowDrivesOrder(state,o)).slice(0,8);if(!orders.length)return;
  after(async()=>{
    try{const {chain,planner,supplier,supplierAuthority,vaultFunder}=await configuredOrderChain(request);for(let i=0;i<orders.length;i+=2)await Promise.all(orders.slice(i,i+2).map(o=>runOrder(store,ownerId,o.id,chain,{delayMs:250,planner,supplier,supplierAuthority,vaultFunder})));}
    catch{console.error('[agentos] Onchain order checkpoints await configured RPC recovery.');}
  });
}
