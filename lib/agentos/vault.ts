import {futurePurchaseReservations} from './purchase-reservations.ts';
import {parseAbi,type Address,type Hex,type PublicClient} from 'viem';
import {canonical} from '../../cre/workflow/verify.ts';
import {centsToToken,tokenABI} from '../../sdk/chain.ts';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import {digest,DomainError} from './engine.ts';
import type {Skill,Workspace} from './types.ts';
import {normalizePluginPermissions,type VaultPluginPermission} from './plugin-purchase-protocol.ts';

export const vaultABI=parseAbi([
 'function owner() view returns(address)','function token() view returns(address)','function escrow() view returns(address)',
 'function grants(address) view returns(uint128 perTask,uint128 daily,uint64 expires)',
 'function grantEpochs(address) view returns(uint256)','function sellers(address) view returns(bool)',
 'function spent(address,uint256) view returns(uint256)',
 'function grant(address executor,uint128 perTask,uint128 daily,uint64 expires)',
 'function allowSeller(address seller,bool allowed)','function revoke(address executor)','function withdraw(uint256 amount)',
 'function execute(bytes32 id,address seller,uint256 amount,uint64 deadline,bytes32 specHash)',
]);
export type VaultBinding={sessionId:string;chainId:number;escrow:Address;token:Address;seller:Address;sellers?:Address[];vault:Address;executor:Address;owner:Address;epoch:string;perTaskCents:number;totalCents:number;dailyCents:number;expires:string;skills:Skill[];scope:string;pluginPermissions?:VaultPluginPermission[]};
export type VaultSession=VaultBinding&{message:string;challengeExpiresAt:string;signature?:Hex;revokedAt?:string};
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
export function normalizedVaultSellers(defaultSeller:Address,input?:Address[]):Address[]{
 const values=input??[];
 if(!Array.isArray(values)||values.length>8||values.some(a=>typeof a!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(a)||/^0x0{40}$/.test(a))||new Set(values.map(a=>a.toLowerCase())).size!==values.length)throw new DomainError('Vault sellers must be unique nonzero addresses.','FORBIDDEN');
 const sellers=[...new Set([defaultSeller.toLowerCase(),...values.map(a=>a.toLowerCase())])].sort() as Address[];
 if(sellers.length>8)throw new DomainError('Vault sessions support at most eight sellers.','FORBIDDEN');return sellers;
}
export function assertVaultSeller(binding:Pick<VaultBinding,'seller'|'sellers'>,seller:Address){
 if(!(binding.sellers??[binding.seller]).some(a=>same(a,seller)))throw new DomainError('The signed Vault session does not permit this seller.','FORBIDDEN');
}
export async function inspectVault(client:PublicClient,deployment:WalletDeployment){
 if(!deployment.vault||!deployment.vaultExecutor)throw new DomainError('AgentVault is not configured.','UNAVAILABLE');
 if(await client.getChainId()!==deployment.chainId)throw new DomainError('Vault RPC has the wrong chain.','FORBIDDEN');
 const vault=deployment.vault,executor=deployment.vaultExecutor,block=await client.getBlock();
 const [owner,token,escrow,grant,epoch,seller,decimals,balance]=await Promise.all([
  client.readContract({address:vault,abi:vaultABI,blockNumber:block.number,functionName:'owner'}),client.readContract({address:vault,abi:vaultABI,blockNumber:block.number,functionName:'token'}),client.readContract({address:vault,abi:vaultABI,blockNumber:block.number,functionName:'escrow'}),
  client.readContract({address:vault,abi:vaultABI,blockNumber:block.number,functionName:'grants',args:[executor]}),client.readContract({address:vault,abi:vaultABI,blockNumber:block.number,functionName:'grantEpochs',args:[executor]}),
  client.readContract({address:vault,abi:vaultABI,blockNumber:block.number,functionName:'sellers',args:[deployment.seller]}),
  client.readContract({address:deployment.token,abi:tokenABI,blockNumber:block.number,functionName:'decimals'}),client.readContract({address:deployment.token,abi:tokenABI,blockNumber:block.number,functionName:'balanceOf',args:[vault]}),
 ]);
 if(!same(token,deployment.token)||!same(escrow,deployment.escrow)||decimals>36)throw new DomainError('Vault deployment does not match its escrow.','FORBIDDEN');
 const spent=await client.readContract({address:vault,abi:vaultABI,blockNumber:block.number,functionName:'spent',args:[executor,block.timestamp/86400n]});
 return {vault,executor,owner,grant,epoch,seller,now:block.timestamp,decimals,balance,spent};
}
export async function checkVaultBinding(client:PublicClient,deployment:WalletDeployment,binding:VaultBinding){
 const view=await inspectVault(client,deployment);
 if(binding.pluginPermissions&&canonical(binding.pluginPermissions)!==canonical(normalizePluginPermissions(binding.pluginPermissions)))throw new DomainError('Vault plugin permissions differ from their signed normalization.','FORBIDDEN');
 if(binding.sellers&&(canonical(binding.sellers)!==canonical(normalizedVaultSellers(deployment.seller,binding.sellers))))throw new DomainError('Vault seller authorization differs from its signed session.','FORBIDDEN');
 if(binding.chainId!==deployment.chainId||!same(binding.escrow,deployment.escrow)||!same(binding.token,deployment.token)||!same(binding.seller,deployment.seller)||!same(binding.vault,view.vault)||!same(binding.executor,view.executor)||!same(binding.owner,view.owner)||binding.epoch!==view.epoch.toString()||binding.expires!==view.grant[2].toString()||!view.seller||view.grant[2]<=view.now||view.grant[0]!==centsToToken(binding.perTaskCents,view.decimals)||view.grant[1]!==centsToToken(binding.dailyCents,view.decimals))throw new DomainError('Vault grant has expired, changed or been revoked.','FORBIDDEN');
 const sellers=binding.sellers??[binding.seller];
 if(!(await Promise.all(sellers.map(seller=>client.readContract({address:view.vault,abi:vaultABI,functionName:'sellers',args:[seller]})))).every(Boolean))throw new DomainError('A permitted Vault seller has been revoked.','FORBIDDEN');
 return view;
}
/** A zero-cost preflight still verifies the live grant; no token amount is rounded or transferred. */
export async function checkVaultSessionAllowance(client:PublicClient,deployment:WalletDeployment,session:VaultSession,gross:number){
 if(!session.signature||session.revokedAt)throw new DomainError('An active Vault session is required.','FORBIDDEN');
 if(!Number.isSafeInteger(gross)||gross<0)throw new DomainError('Invalid workflow fee ceiling.','FORBIDDEN');
 const view=await checkVaultBinding(client,deployment,session),amount=gross===0?0n:centsToToken(gross,view.decimals);
 if(view.spent+amount>view.grant[1])throw new DomainError('Remaining onchain daily allowance cannot cover the approved workflow ceilings.','FORBIDDEN');
 return view;
}
export async function prepareVaultSession(state:Workspace,ownerId:string,deployment:WalletDeployment,client:PublicClient,input:{buyer:Address;perTaskCents:number;totalCents:number;dailyCents?:number;sellers?:Address[];pluginPermissions?:VaultPluginPermission[]},id:string,now=new Date().toISOString()){
 const view=await inspectVault(client,deployment);
 const dailyCents=input.dailyCents??input.totalCents;
 if(!same(input.buyer,view.owner)||!state.policy.active||!Number.isSafeInteger(input.perTaskCents)||!Number.isSafeInteger(input.totalCents)||!Number.isSafeInteger(dailyCents)||input.perTaskCents<1||input.totalCents<input.perTaskCents||dailyCents<input.totalCents||dailyCents>1000000)throw new DomainError('Vault limits or owner do not match.','FORBIDDEN');
 const binding:VaultBinding={sessionId:id,chainId:deployment.chainId,escrow:deployment.escrow,token:deployment.token,seller:deployment.seller,...(input.sellers?{sellers:normalizedVaultSellers(deployment.seller,input.sellers)}:{}),...(input.pluginPermissions?{pluginPermissions:normalizePluginPermissions(input.pluginPermissions)}:{}),vault:view.vault,executor:view.executor,owner:view.owner,epoch:view.epoch.toString(),perTaskCents:input.perTaskCents,totalCents:input.totalCents,dailyCents,expires:view.grant[2].toString(),skills:[...state.policy.allowedSkills],scope:await digest({workspace:ownerId})};
 if(view.grant[2]>view.now+86400n)throw new DomainError('Vault sessions may last at most 24 hours.');
 await checkVaultBinding(client,deployment,binding);
 const challengeExpiresAt=new Date(Date.parse(now)+300000).toISOString();
 const message=['AgentOS chain reconciliation v1','Purpose: authorize bounded AgentVault purchases without per-order signatures.',`Buyer: ${view.owner}`,`Chain: ${deployment.chainId}`,`Escrow: ${deployment.escrow}`,`Token: ${deployment.token}`,`Seller: ${deployment.seller}`,`Grant: ${canonical(binding)}`,`Challenge expires: ${challengeExpiresAt}`].join('\n');
 return {...binding,message,challengeExpiresAt} satisfies VaultSession;
}
export function sessionBinding(session:VaultSession):VaultBinding{
 const {message:_,challengeExpiresAt:__,signature:___,revokedAt:____,...binding}=session;return binding;
}
export function vaultAllowance(state:Workspace,sessionId:string,buyer:Address,skill:Skill,budget:number,quote:number,now=new Date().toISOString(),excludeOrder?:string){
 const session=vaultMoneyAllowance(state,sessionId,buyer,budget,quote,now,excludeOrder);
 if(!session.skills.includes(skill))throw new DomainError('No active Vault session authorizes this purchase.','FORBIDDEN');return session;
}
export function pluginVaultAllowance(state:Workspace,sessionId:string,buyer:Address,permission:VaultPluginPermission,budget:number,additionalQuote:number,now=new Date().toISOString()){
 const session=vaultMoneyAllowance(state,sessionId,buyer,budget,additionalQuote,now);
 if(!session.pluginPermissions?.some(p=>p.pluginId===permission.pluginId&&p.manifestHash===permission.manifestHash&&p.runtimeHash===permission.runtimeHash&&p.maxPriceCents>=permission.maxPriceCents))throw new DomainError('The signed Vault session does not authorize this plugin, runtime and price.','FORBIDDEN');return session;
}
function vaultMoneyAllowance(state:Workspace,sessionId:string,buyer:Address,budget:number,quote:number,now:string,excludeOrder?:string){
 const session=state.vaultSessions?.find(s=>s.sessionId===sessionId);
 if(!session?.signature||session.revokedAt||!same(session.owner,buyer)||!Number.isSafeInteger(budget)||budget<0||!Number.isSafeInteger(quote)||quote<0||BigInt(session.expires)<=BigInt(Math.floor(Date.parse(now)/1000))||budget>session.perTaskCents)throw new DomainError('No active Vault session authorizes this purchase.','FORBIDDEN');
 // Reserve immutable quotes before any RPC. Refunds consume session allowance.
 const used=(state.chainOrders??[]).filter(o=>o.id!==excludeOrder&&o.vault?.sessionId===sessionId&&(o.funding||o.status!=='cancelled')).reduce((sum,o)=>sum+o.quote,0);
 const future=futurePurchaseReservations(state).filter(r=>r.vaultSessionId===sessionId).reduce((sum,r)=>sum+r.quote,0);
 if(used+future+quote>session.totalCents)throw new DomainError('Vault session total allowance would be exceeded.','FORBIDDEN');
 return session;
}
