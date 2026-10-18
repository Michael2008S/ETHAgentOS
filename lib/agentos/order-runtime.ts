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
export async function configuredOrderChain(request:Request){
  const {client,deployment}=await serverChain(request,env.AGENTOS_CHAIN_CONFIGURATION).catch(error=>{if(error instanceof DomainError)throw error;throw new DomainError('Onchain configuration is unavailable.','UNAVAILABLE');});
  const localCall=deployment.mode==='local'?async<T={hash:`0x${string}`}>(path:string,body:unknown):Promise<T>=>{
    const response=await fetch('http://127.0.0.1:8545'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    const data=await response.json() as T & {error?:string};if(!response.ok)throw new Error(data.error??'Local order settlement failed.');return data;
  }:undefined;
  return {chain:orderChain(client,deployment,localCall),deployment,localCall,planner:await configuredPlanner(request).catch(()=>undefined)};
}
export function scheduleOrders(ownerId:string,state:Workspace,request:Request){
  const orders=pendingOrders(state).slice(0,8);if(!orders.length)return;
  after(async()=>{
    try{const {chain,planner}=await configuredOrderChain(request);for(let i=0;i<orders.length;i+=2)await Promise.all(orders.slice(i,i+2).map(o=>runOrder(store,ownerId,o.id,chain,{delayMs:250,planner})));}
    catch{console.error('[agentos] Onchain order checkpoints await configured RPC recovery.');}
  });
}
