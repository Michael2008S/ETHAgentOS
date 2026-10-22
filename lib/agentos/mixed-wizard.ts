import {normalizeInput,DomainError} from './engine.ts';
import {validateMixedProgram,type MixedWorkflowDraft} from './mixed-workflow.ts';
import {transferNormalizer,treasuryReportPlugin} from './mixed-examples.ts';
import {usdcTreasuryPolicyPlugin} from './treasury-business.ts';
import type {PluginManifest} from './plugin-protocol.ts';
import type {ServiceDescriptor} from './service-catalog.ts';
import type {TaskInput} from './types.ts';
export type BusinessMode='normalized-brief'|'treasury-brief'|'usdc-policy';
export function treasuryPolicyManifest(thresholdBps=5000):PluginManifest{
 if(!Number.isInteger(thresholdBps)||thresholdBps<1||thresholdBps>10000)throw new DomainError('Concentration threshold must be 1–10000 basis points.');
 const original=usdcTreasuryPolicyPlugin();if(thresholdBps===5000)return original;const manifest=structuredClone(original),percent=String(thresholdBps/100)+'%';manifest.id='plugin:usdc-treasury-policy-'+thresholdBps+'@1.0.0';manifest.name='USDC treasury concentration '+percent;manifest.description='Review exact finalized USDC allocations; request human review at '+percent+' recipient concentration.';manifest.output.properties!.thresholdBps.enum=[thresholdBps];manifest.code=manifest.code.replaceAll('5000',String(thresholdBps)).replaceAll('50%',percent);manifest.verifier=manifest.verifier.replaceAll('5000',String(thresholdBps)).replaceAll('50%',percent);return manifest;
}
export const businessManifests=(mode:BusinessMode,threshold=5000)=>mode==='normalized-brief'?[transferNormalizer(),treasuryReportPlugin()]:mode==='treasury-brief'?[treasuryReportPlugin()]:[treasuryPolicyManifest(threshold)];
export function transferFormInput(records:NonNullable<TaskInput['records']>):TaskInput{
 if(!records.length)throw new DomainError('Add at least one transfer.');return normalizeInput({dataset:'custom-transfers-v1',blockFrom:Math.min(...records.map(r=>r.block)),blockTo:Math.max(...records.map(r=>r.block)),records});
}
export async function businessWizardDraft({requestId=crypto.randomUUID(),buyer,title,input,mode,catalog,thresholdBps=5000}:{requestId?:string;buyer:string;title:string;input:TaskInput;mode:BusinessMode;catalog:ServiceDescriptor[];thresholdBps?:number}):Promise<MixedWorkflowDraft>{
 const root=normalizeInput(input),skill=catalog.find(s=>s.executor==='builtin'&&s.binding.skill==='treasury-report');if(!skill)throw new DomainError('Treasury service unavailable.');if(mode==='usdc-policy'&&!root.source)throw new DomainError('Import finalized mainnet USDC data before policy analysis.');if(mode==='normalized-brief'&&root.source)throw new DomainError('Use the sourced treasury route to preserve mainnet provenance.');const manifests=businessManifests(mode,thresholdBps),selected=mode==='normalized-brief'?[catalog.find(s=>s.id===manifests[0].id),skill,catalog.find(s=>s.id===manifests[1].id)]:[skill,catalog.find(s=>s.id===manifests[0].id)];if(selected.some(s=>!s))throw new DomainError('Prepare the reviewed business plugin versions first.');
 const steps=selected.map((s,i)=>({serviceId:s!.id,serviceDigest:s!.digest,maxPriceCents:s!.priceCents,input:i?{from:'step' as const,step:i-1,adapter:s!.executor!=='plugin'?'transfers.v1' as const:mode==='usdc-policy'?'business-usdc.v1' as const:'business-summary.v1' as const,path:[]}:{from:'root' as const,adapter:s!.executor==='plugin'?'json.v1' as const:'transfers.v1' as const,path:[]}})),draft={requestId,title:title.trim().slice(0,120)||'Treasury business workflow',buyer,vaultSessionId:crypto.randomUUID(),input:root as MixedWorkflowDraft['input'],steps,totalBudget:steps.reduce((n,s)=>n+s.maxPriceCents,0),timeoutSeconds:600};await validateMixedProgram(draft,catalog);return draft;
}
export function mixedGrantSelections(draft:MixedWorkflowDraft,catalog:ServiceDescriptor[]){
 const grants=new Map<string,{pluginId:string;manifestHash:string;runtimeHash:string;maxPriceCents:number;maxRuns:number}>();for(const step of draft.steps.slice(draft.repair?.prefixLength??0)){const s=catalog.find(s=>s.id===step.serviceId&&s.digest===step.serviceDigest);if(!s)throw new DomainError('Service changed. Prepare and review again.');if(s.executor!=='plugin')continue;const prior=grants.get(s.id);if(prior){prior.maxRuns++;prior.maxPriceCents=Math.max(prior.maxPriceCents,step.maxPriceCents);}else grants.set(s.id,{pluginId:s.binding.pluginId!,manifestHash:s.binding.manifestHash!,runtimeHash:s.binding.runtimeHash!,maxPriceCents:step.maxPriceCents,maxRuns:1});}return [...grants.values()];
}

/** Decimal percentages are parsed as text to avoid IEEE-754 validation drift. */
export function percentToBps(value:string|number){
 const text=String(value).trim();if(!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(text))throw new DomainError('Threshold must have at most two decimal places.');const [whole,fraction='']=text.split('.'),bps=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(bps<1||bps>10000)throw new DomainError('Threshold must be 0.01–100%.');return bps;
}
export function draftThresholdBps(draft:MixedWorkflowDraft){
 const id=draft.steps.find(s=>/^plugin:usdc-treasury-policy(?:-[0-9]+)?@1\.0\.0$/.test(s.serviceId))?.serviceId;if(!id)return undefined;return Number(id.match(/policy-([0-9]+)@/)?.[1]??5000);
}
