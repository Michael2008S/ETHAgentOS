import {localServices} from './local-services';
import {env} from 'cloudflare:workers';
import type {PublicClient} from 'viem';
import type {WalletDeployment} from '../../sdk/wallet';
import {DomainError} from './engine';
import {createSupplier} from './supplier';
import {parseSupplierConfigurations,parseSupplierKeys,readSupplierJSON,supplierPool} from './supplier-pool';
import {authorizeSupplier} from './supplier-chain';
import {read} from './store';
import {isX402Supplier} from './x402-policy';
import {x402SupplierPolicy,x402SupplierHooks} from './x402-supplier-runtime';

async function localConfigurations(){
 const base=localServices().supplier,response=await fetch(base+'/catalog',{redirect:'manual',signal:AbortSignal.timeout(3000)});
 if(response.status===404){const legacy=await fetch(base+'/config',{redirect:'manual',signal:AbortSignal.timeout(3000)});if(!legacy.ok)throw new Error('Unavailable supplier');return [await readSupplierJSON(legacy)];}
 if(!response.ok)throw new Error('Unavailable catalog');return readSupplierJSON(response);
}
export async function configuredSupplier(request:Request,client:PublicClient,deployment:WalletDeployment){
 const local=Boolean(import.meta.env.DEV)&&['127.0.0.1','localhost','[::1]'].includes(new URL(request.url).hostname);let source:unknown,keySource:unknown;
 try{
  source=env.AGENTOS_SUPPLIER_CONFIGURATIONS?JSON.parse(env.AGENTOS_SUPPLIER_CONFIGURATIONS):env.AGENTOS_SUPPLIER_CONFIGURATION?[JSON.parse(env.AGENTOS_SUPPLIER_CONFIGURATION)]:local?await localConfigurations():null;
  if(env.AGENTOS_SUPPLIER_API_KEYS)keySource=JSON.parse(env.AGENTOS_SUPPLIER_API_KEYS);
 }catch{throw new DomainError('Supplier configuration is unavailable.','UNAVAILABLE');}
 if(!source)throw new DomainError('Skill supplier is not configured.','UNAVAILABLE');
 const configurations=parseSupplierConfigurations(source,local),keys=parseSupplierKeys(keySource,configurations);
 const suppliers=await Promise.all(configurations.map(async config=>{
  let hooks,policy;
  if(isX402Supplier(config)){
   if(!local||!env.DB||deployment.mode!=='local')throw new DomainError('x402 procurement requires the local Vault runtime.','SUPPLIER_REJECTED');
   policy=await x402SupplierPolicy(config);hooks=x402SupplierHooks({database:env.DB,read},config,policy,new URL(request.url).origin,client);
  }
  const supplier=await createSupplier(config,async order=>{if(!order.agentIdentity||!order.supplier)throw new DomainError('Supplier execution requires an identity-bound order.','SUPPLIER_REJECTED');await authorizeSupplier(client,deployment,order.agentIdentity,order.supplier);},keys.get(config.id)??(config.id===configurations[0].id?env.AGENTOS_SUPPLIER_API_KEY:undefined),fetch,hooks);if(policy)supplier.procurementPolicy=policy;return supplier;
 }));
 return supplierPool(suppliers);
}
