import {z} from 'zod';
import {pluginManifestSchema,boundedJson,type Json,type PluginManifest,type PluginExecution,type PluginRuntimeDescriptor} from './plugin-protocol.ts';
import {DomainError} from './engine.ts';
import type {Workspace} from './types.ts';
export type PluginStatus='queued'|'running'|'completed'|'failed'|'cancelled'|'expired';
export type PluginJobRef={id:string;pluginId:string;status:PluginStatus;deadlineAt:string;leaseUntil?:string};
export type InstalledPlugin={manifest:PluginManifest;manifestHash:string;createdAt:string};
export type PluginGrant={requestId:string;pluginId:string;manifestHash:string;runtimeHash:string;epoch:number;enabled:boolean;maxRuns:number;used:number;expiresAt:string;createdAt:string};
export type PluginJob={purchase?:{workflowId:string;step:number};id:string;requestId:string;draftHash:string;scope:string;pluginId:string;manifestHash:string;runtimeHash:string;grantEpoch:number;input:Json;inputHash:string;requestHash:string;createdAt:string;updatedAt:string;deadlineAt:string;status:PluginStatus;attempts:number;lease?:{token:string;until:string};execution?:PluginExecution;lastError?:string};
const hash=z.string().regex(/^0x[0-9a-f]{64}$/),id=z.string().min(1).max(100),uuid=z.string().uuid(),json=z.custom<Json>(v=>{try{boundedJson(v);return true;}catch{return false;}},'Invalid bounded plugin JSON.');
export const pluginRequestSchema=z.union([
 z.object({action:z.literal('install'),manifest:pluginManifestSchema}).strict(),
 z.object({action:z.literal('grant'),requestId:uuid,pluginId:id,manifestHash:hash,runtimeHash:hash,maxRuns:z.number().int().min(1).max(100),durationSeconds:z.number().int().min(60).max(86400)}).strict(),
 z.object({action:z.literal('revoke'),requestId:uuid,pluginId:id,epoch:z.number().int().positive()}).strict(),
 z.object({action:z.literal('create'),requestId:uuid,pluginId:id,manifestHash:hash,runtimeHash:hash,input:json,timeoutSeconds:z.number().int().min(30).max(600).default(300)}).strict(),
 z.object({action:z.literal('cancel'),jobId:id}).strict(),
]);
export type PluginRequest=z.infer<typeof pluginRequestSchema>;
export function pluginAuthority(state:Workspace,job:PluginJob,installed:InstalledPlugin|undefined,grant:PluginGrant|undefined,now=new Date().toISOString()){
 if(job.purchase&&state.mixedWorkflows?.some(f=>f.status!=='running'&&f.steps.some(s=>s.childId===job.purchase!.workflowId)))throw new DomainError('Mixed workflow execution has stopped.','FORBIDDEN');
 if(job.purchase){const flow=state.pluginPurchases?.find(f=>f.id===job.purchase!.workflowId),step=flow?.steps[job.purchase.step];if(flow?.status!=='running'||flow.deadlineAt<=now||!step?.confirmed||step.jobId!==job.id||step.pluginId!==job.pluginId||step.manifestHash!==job.manifestHash||step.runtimeHash!==job.runtimeHash||step.grantEpoch!==job.grantEpoch||step.inputHash!==job.inputHash||!['funded','executing'].includes(step.status))throw new DomainError('Paid plugin execution requires its current confirmed escrow.','FORBIDDEN');}
 if(!state.policy.active||!installed||installed.manifestHash!==job.manifestHash||!grant?.enabled||grant.epoch!==job.grantEpoch||grant.manifestHash!==job.manifestHash||grant.runtimeHash!==job.runtimeHash||grant.expiresAt<=now)throw new DomainError('Plugin execution permission expired or was revoked.','FORBIDDEN');if(job.deadlineAt<=now)throw new DomainError('Plugin execution deadline passed.','FORBIDDEN');
}
export function pluginToolsAvailable(manifest:PluginManifest,runtime:PluginRuntimeDescriptor){if(!manifest.tools.every(t=>runtime.tools.some(c=>c.serverId===t.serverId&&c.name===t.name&&c.toolHash===t.toolHash&&c.readOnly)))throw new DomainError('Plugin MCP capabilities changed. Review and grant again.','FORBIDDEN');}
export function pluginPublicJob(job:PluginJob){const {lease:_,...publicJob}=job;return publicJob;}
export const pluginExecutionRequest=(job:PluginJob,installed:InstalledPlugin)=>({jobId:job.id,scope:job.scope,manifest:installed.manifest,manifestHash:job.manifestHash,input:job.input,inputHash:job.inputHash,runtimeHash:job.runtimeHash});
