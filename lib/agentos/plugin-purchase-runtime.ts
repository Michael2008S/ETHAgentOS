import {env} from 'cloudflare:workers';import {after} from 'next/server';
import {serverChain} from './chain-config';import {localServices} from './local-services';import {isLoopback} from './auth';import {DomainError} from './engine';
import {createPluginPurchaseChain} from './plugin-purchase-chain';import {configuredPluginExecutor,pluginDatabase} from './plugin-runtime';import {checkVaultSessionAllowance} from './vault';
import {runPluginPurchase,type PluginPurchaseRuntime} from './plugin-purchase-runner';import type {PluginPurchaseContext} from './plugin-purchase-store';import type {Workspace} from './types';
export async function configuredPluginPurchaseRuntime(request:Request):Promise<PluginPurchaseRuntime>{
 if(!import.meta.env.DEV||!isLoopback(new URL(request.url)))throw new DomainError('Public generic plugin purchasing is deferred.','UNAVAILABLE');
 const {client,deployment}=await serverChain(request,env.AGENTOS_CHAIN_CONFIGURATION);
 if(deployment.mode!=='local'||!deployment.vault||!deployment.vaultExecutor)throw new DomainError('A local plugin purchase Vault is required.','UNAVAILABLE');
 const call=async(path:string,body:unknown)=>{
  if(!['/plugin-purchase/fund','/plugin-purchase/settle'].includes(path))throw new DomainError('Unsupported plugin payment operation.','FORBIDDEN');const text=JSON.stringify(body);if(new TextEncoder().encode(text).length>524288)throw new DomainError('Plugin payment evidence exceeds its bound.','FORBIDDEN');
  let response:Response;try{response=await fetch(localServices().chain+path,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:text,signal:AbortSignal.timeout(90000)});}catch{throw new DomainError('Plugin chain executor is unavailable. Original intent retained.','UNAVAILABLE');}
  const value=await response.text();if(new TextEncoder().encode(value).length>16384||!response.ok)throw new DomainError('Plugin chain executor refused or could not verify the original intent.','UNAVAILABLE');const result=JSON.parse(value);if(!/^0x[0-9a-f]{64}$/.test(result.hash))throw new DomainError('Plugin chain transaction response is invalid.','UNAVAILABLE');return result as {hash:`0x${string}`};
 };
 return {chain:createPluginPurchaseChain(client,deployment,call),executor:()=>configuredPluginExecutor(request),checkSession:(session,gross)=>checkVaultSessionAllowance(client,deployment,session,gross)};
}
export async function configuredPluginPurchaseContext(request:Request):Promise<PluginPurchaseContext>{const runtime=await configuredPluginPurchaseRuntime(request),executor=await runtime.executor(),priceCents=Number(env.AGENTOS_PLUGIN_PURCHASE_PRICE_CENTS??'100');if(!Number.isSafeInteger(priceCents)||priceCents<1||priceCents>1000000)throw new DomainError('Plugin service price is not configured.','UNAVAILABLE');return {chain:runtime.chain,runtime:executor.descriptor,deployment:runtime.chain.deployment,priceCents,checkSession:runtime.checkSession};}
export function schedulePluginPurchases(owner:string,state:Workspace,request:Request){const flows=(state.pluginPurchases??[]).filter(f=>f.status==='running'||f.status==='cancelling').slice(0,2);if(!flows.length)return;after(async()=>{for(const flow of flows)try{await runPluginPurchase(pluginDatabase(),owner,flow.id,()=>configuredPluginPurchaseRuntime(request));}catch{console.error('[agentos] Plugin purchase checkpoint awaits recovery.');}});}
