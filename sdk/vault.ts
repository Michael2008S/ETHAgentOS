import {encodeFunctionData,parseAbi,type Hex} from 'viem';
import {AgentWalletSession,type WalletDeployment} from './wallet.ts';
import {centsToToken} from './chain.ts';
import {inspectVault,vaultABI,sessionBinding,normalizedVaultSellers,type VaultSession} from '../lib/agentos/vault.ts';
import {canonical} from '../cre/workflow/verify.ts';
import type {Workspace} from '../lib/agentos/types.ts';
import {normalizePluginPermissions,type VaultPluginPermission} from '../lib/agentos/plugin-purchase-protocol.ts';
export class AgentVaultClient{
 readonly wallet:AgentWalletSession;readonly baseURL:string;readonly headers:Record<string,string>;
 constructor(wallet:AgentWalletSession,baseURL='',headers:Record<string,string>={}){this.wallet=wallet;this.baseURL=baseURL;this.headers=headers;}
 private async post(body:unknown){
  const response=await fetch(this.baseURL+'/api/vault',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',...this.headers},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)}),value=await response.json() as {session:VaultSession;error?:string};if(!response.ok)throw new Error(value.error??'Vault request failed.');return value.session;
 }
 async sessions(){const r=await fetch(this.baseURL+'/api/vault',{headers:this.headers,credentials:'include',cache:'no-store'}),data=await r.json() as {deployment:WalletDeployment;sessions:VaultSession[];view:unknown;error?:string};if(!r.ok)throw new Error(data.error??'Vault unavailable.');return data;}
 async authorize(input:{depositCents:number;perTaskCents:number;totalCents:number;dailyCents?:number;durationSeconds:number;sellers?:`0x${string}`[];pluginPermissions?:VaultPluginPermission[]}){
  const dailyCents=input.dailyCents??input.totalCents,sellers=normalizedVaultSellers(this.wallet.deployment.seller,input.sellers),pluginPermissions=input.pluginPermissions?normalizePluginPermissions(input.pluginPermissions):undefined;
  if(!Number.isSafeInteger(input.depositCents)||input.depositCents<0||!Number.isSafeInteger(input.perTaskCents)||input.perTaskCents<1||!Number.isSafeInteger(input.totalCents)||input.totalCents<input.perTaskCents||!Number.isSafeInteger(dailyCents)||dailyCents<input.totalCents||dailyCents>1000000||!Number.isSafeInteger(input.durationSeconds)||input.durationSeconds<60||input.durationSeconds>86400)throw new Error('Invalid Vault grant limits.');
  if(pluginPermissions?.some(p=>p.maxPriceCents>input.perTaskCents))throw new Error('Plugin price limits exceed the per-purchase grant.');
  await this.wallet.assertSession();const remote=await this.sessions();if(canonical(remote.deployment).toLowerCase()!==canonical(this.wallet.deployment).toLowerCase())throw new Error('Server Vault deployment differs from the wallet.');let view=await inspectVault(this.wallet.client,this.wallet.deployment);
  if(view.owner.toLowerCase()!==this.wallet.account.toLowerCase())throw new Error('Only the configured Vault owner may grant spending.');
  const perTask=centsToToken(input.perTaskCents,view.decimals),daily=centsToToken(dailyCents,view.decimals);
  if(daily>=2n**128n)throw new Error('Vault allowance exceeds uint128.');
  if(input.depositCents)await this.wallet.send({to:this.wallet.deployment.token,data:encodeFunctionData({abi:parseAbi(['function transfer(address,uint256) returns(bool)']),functionName:'transfer',args:[view.vault,centsToToken(input.depositCents,view.decimals)]})});
  for(const seller of sellers)await this.wallet.send({to:view.vault,data:encodeFunctionData({abi:vaultABI,functionName:'allowSeller',args:[seller,true]})});
  const expires=(await this.wallet.client.getBlock()).timestamp+BigInt(input.durationSeconds);
  await this.wallet.send({to:view.vault,data:encodeFunctionData({abi:vaultABI,functionName:'grant',args:[view.executor,perTask,daily,expires]})});
  view=await inspectVault(this.wallet.client,this.wallet.deployment);
  const r=await fetch(this.baseURL+'/api/workspace',{headers:this.headers,credentials:'include',cache:'no-store'}),workspace=await r.json() as {scope:string;state:Workspace};if(!r.ok)throw new Error('Workspace unavailable.');
  const session=await this.post({action:'prepare',buyer:this.wallet.account,perTaskCents:input.perTaskCents,totalCents:input.totalCents,dailyCents,...(input.sellers?{sellers}:{}),...(pluginPermissions?{pluginPermissions}:{})});
  if(canonical(session.pluginPermissions)!==canonical(pluginPermissions))throw new Error('Server Vault plugin permissions differ from the reviewed grant.');
  if(canonical(normalizedVaultSellers(this.wallet.deployment.seller,session.sellers))!==canonical(sellers)||session.owner.toLowerCase()!==this.wallet.account.toLowerCase()||session.vault.toLowerCase()!==view.vault.toLowerCase()||session.executor.toLowerCase()!==view.executor.toLowerCase()||session.chainId!==this.wallet.deployment.chainId||session.escrow.toLowerCase()!==this.wallet.deployment.escrow.toLowerCase()||session.token.toLowerCase()!==this.wallet.deployment.token.toLowerCase()||session.seller.toLowerCase()!==this.wallet.deployment.seller.toLowerCase()||session.scope!==workspace.scope||canonical(session.skills)!==canonical(workspace.state.policy.allowedSkills)||session.perTaskCents!==input.perTaskCents||session.totalCents!==input.totalCents||session.dailyCents!==dailyCents||session.epoch!==view.epoch.toString()||session.expires!==expires.toString()||!session.message.includes('Grant: '+canonical(sessionBinding(session)))||!session.message.includes('Challenge expires: '+session.challengeExpiresAt)||Date.parse(session.challengeExpiresAt)<=Date.now()||Date.parse(session.challengeExpiresAt)>Date.now()+305000)throw new Error('Server Vault challenge differs from the approved grant.');
  const signature=await this.wallet.signReconciliation(session.message);return this.post({action:'bind',sessionId:session.sessionId,signature});
 }
 async revoke(sessionId:string){
  const view=await inspectVault(this.wallet.client,this.wallet.deployment);if(view.owner.toLowerCase()!==this.wallet.account.toLowerCase())throw new Error('Only the Vault owner may revoke spending.');await this.wallet.send({to:view.vault,data:encodeFunctionData({abi:vaultABI,functionName:'revoke',args:[view.executor]})});return this.post({action:'revoke',sessionId});
 }
 async withdraw(cents:number){const view=await inspectVault(this.wallet.client,this.wallet.deployment);if(view.owner.toLowerCase()!==this.wallet.account.toLowerCase())throw new Error('Only the Vault owner may withdraw.');return this.wallet.send({to:view.vault,data:encodeFunctionData({abi:vaultABI,functionName:'withdraw',args:[centsToToken(cents,view.decimals)]})});}
}
