import {z} from 'zod';
import {read,updateWorkspace,owner,checkOrigin} from '@/lib/agentos/store';
import {configuredOrderChain} from '@/lib/agentos/order-runtime';
import {prepareVaultSession,inspectVault,checkVaultBinding,refreshVaultChallenge} from '@/lib/agentos/vault';
import {DomainError,digest} from '@/lib/agentos/engine';
import {apiFailure} from '@/lib/agentos/api-failure';
import {vaultPluginPermissionSchema,normalizePluginPermissions} from '@/lib/agentos/plugin-purchase-protocol';
import {pluginInstallation} from '@/lib/agentos/plugin-store';
import {pluginDatabase,configuredPluginExecutor} from '@/lib/agentos/plugin-runtime';
import {pluginToolsAvailable} from '@/lib/agentos/plugin-state';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('prepare'),requestId:z.string().uuid().optional(),buyer:z.string().regex(/^0x[0-9a-fA-F]{40}$/),perTaskCents:z.number().int().positive().max(1000000),totalCents:z.number().int().positive().max(1000000),dailyCents:z.number().int().positive().max(1000000).optional(),sellers:z.array(z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(a=>a as `0x${string}`)).min(1).max(8).optional(),pluginPermissions:z.array(vaultPluginPermissionSchema).min(1).max(20).optional()}).strict(),
 z.object({action:z.literal('bind'),sessionId:z.string().uuid(),signature:z.string().regex(/^0x[0-9a-fA-F]+$/).min(130).max(8194)}).strict(),
 z.object({action:z.literal('revoke'),sessionId:z.string().uuid()}).strict(),
]);
export async function GET(request:Request){try{
 const ownerId=owner(request),snapshot=await read(ownerId),{client,deployment}=await configuredOrderChain(request);
 const view=deployment.vault?await inspectVault(client,deployment):null;
 return Response.json({deployment,sessions:snapshot.state.vaultSessions??[],view:view?{...view,grant:view.grant.map(String),epoch:view.epoch.toString(),now:view.now.toString(),balance:view.balance.toString(),spent:view.spent.toString()}:null},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiFailure(error,'chain');}}
export async function POST(request:Request){try{
 checkOrigin(request);const ownerId=owner(request);
 if(!request.headers.get('Content-Type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415});
 const raw=await request.text();if(new TextEncoder().encode(raw).length>16384)return Response.json({error:'Request too large.'},{status:413});
 const body=schema.parse(JSON.parse(raw)),{client,deployment}=await configuredOrderChain(request);
 let result;
 if(body.action==='prepare'){
  if(body.pluginPermissions){const permissions=normalizePluginPermissions(body.pluginPermissions),runtime=(await configuredPluginExecutor(request)).descriptor;for(const p of permissions){const plugin=await pluginInstallation(pluginDatabase().database,ownerId,p.pluginId);if(!plugin||plugin.manifestHash!==p.manifestHash||runtime.configHash!==p.runtimeHash||p.maxPriceCents>body.perTaskCents)throw new DomainError('Review installed plugin code, runtime and price before authorizing payment.','FORBIDDEN');pluginToolsAvailable(plugin.manifest,runtime);}}
  const snapshot=await read(ownerId),old=body.requestId?snapshot.state.vaultSessions?.find(s=>s.sessionId===body.requestId):undefined;if(old){if(old.owner.toLowerCase()!==body.buyer.toLowerCase()||old.perTaskCents!==body.perTaskCents||old.totalCents!==body.totalCents||old.dailyCents!==(body.dailyCents??body.totalCents)||JSON.stringify(old.pluginPermissions)!==JSON.stringify(body.pluginPermissions)||JSON.stringify(old.sellers)!==JSON.stringify(body.sellers))throw new DomainError('Authorization identifier has different parameters.','IDEMPOTENCY_CONFLICT');if(!old.signature&&!old.revokedAt&&old.challengeExpiresAt<=new Date().toISOString()){await checkVaultBinding(client,deployment,old);const fresh=refreshVaultChallenge(old),updated=await updateWorkspace(ownerId,state=>({...state,vaultSessions:state.vaultSessions!.map(s=>s.sessionId===old.sessionId&&!s.signature&&!s.revokedAt&&s.message===old.message?fresh:s)}));return Response.json({session:updated.state.vaultSessions!.find(s=>s.sessionId===old.sessionId)},{headers:{'Cache-Control':'no-store'}});}return Response.json({session:old},{headers:{'Cache-Control':'no-store'}});}const session=await prepareVaultSession(snapshot.state,ownerId,deployment,client,{...body,buyer:body.buyer as `0x${string}`},body.requestId??crypto.randomUUID());
  result=await updateWorkspace(ownerId,state=>{const prior=state.vaultSessions?.find(s=>s.sessionId===session.sessionId);if(prior){if(prior.message!==session.message)throw new DomainError('Authorization is being prepared. Retry the same identifier.','CONFLICT');return state;}if((state.vaultSessions?.length??0)>=40)throw new DomainError('Vault session history is full.');return {...state,vaultSessions:[session,...state.vaultSessions??[]]};});
  return Response.json({session:result.state.vaultSessions!.find(s=>s.sessionId===session.sessionId)},{headers:{'Cache-Control':'no-store'}});
 }
 const snapshot=await read(ownerId),session=snapshot.state.vaultSessions?.find(s=>s.sessionId===body.sessionId);
 if(!session)throw new DomainError('Vault session not found.','NOT_FOUND');
 if(body.action==='bind'){
  if(session.revokedAt||!session.signature&&session.challengeExpiresAt<=new Date().toISOString()||session.scope!==await digest({workspace:ownerId}))throw new DomainError('Vault session challenge expired or was revoked.','FORBIDDEN');
  if(!await client.verifyMessage({address:session.owner,message:session.message,signature:body.signature as `0x${string}`}))throw new DomainError('Vault owner signature is invalid.','FORBIDDEN');
  await checkVaultBinding(client,deployment,session);
  result=await updateWorkspace(ownerId,state=>{const current=state.vaultSessions?.find(s=>s.sessionId===body.sessionId);if(!current||current.message!==session.message||current.revokedAt||!current.signature&&current.challengeExpiresAt<=new Date().toISOString())throw new DomainError('Vault session changed.','CONFLICT');return {...state,vaultSessions:state.vaultSessions!.map(s=>s.sessionId===body.sessionId?{...s,signature:body.signature as `0x${string}`}:s)};});
 }else result=await updateWorkspace(ownerId,state=>({...state,vaultSessions:state.vaultSessions!.map(s=>s.sessionId===body.sessionId?{...s,revokedAt:s.revokedAt??new Date().toISOString()}:s)}));
 return Response.json({session:result.state.vaultSessions!.find(s=>s.sessionId===body.sessionId)},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiFailure(error,'chain');}}
