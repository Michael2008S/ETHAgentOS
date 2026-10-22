import {after} from 'next/server';
import * as store from './store';
import {configuredOrderChain} from './order-runtime';
import {configuredPluginPurchaseContext,configuredPluginPurchaseRuntime} from './plugin-purchase-runtime';
import { pluginDatabase } from './plugin-runtime';
import {pluginRows} from './plugin-store';
import {serviceCatalog,skillService} from './service-catalog';
import {workflowPublisher} from './workflow-runtime';
import {workflowSupplierAccess} from './workflow-supplier-runtime';
import {workflowBindingHash} from './workflow-plans';
import {checkInputSource} from './data-runtime';
import {digest} from './engine';
import {pendingMixed} from './mixed-workflow';
import {runMixedWorkflow,type MixedRuntime} from './mixed-workflow-runner';
import type {MixedCreationContext} from './mixed-workflow-store';
import type {InstalledPlugin} from './plugin-state';
import type {Workspace} from './types';
import type {WorkflowSupplierBinding} from './workflow-suppliers';
export const mixedStore=()=>({...pluginDatabase(),updateWorkspace:store.updateWorkspace});
export async function configuredMixedContext(request:Request,owner:string,state:Workspace):Promise<MixedCreationContext>{
 const plugins=await configuredPluginPurchaseContext(request),installed=await pluginRows<InstalledPlugin>(pluginDatabase().database,owner,'agentos_plugins'),catalog=(await serviceCatalog(state,installed,plugins)).entries,bindings=new Map<string,WorkflowSupplierBinding>(),configured=await configuredOrderChain(request),access=workflowSupplierAccess(configured,await digest({workspace:owner}));
 for(const agent of state.agents.filter(a=>a.enabled&&state.policy.allowedSkills.includes(a.skill)))for(const supplier of configured.supplier?.suppliers??[])if(supplier.descriptor.skills.includes(agent.skill))try{const binding=await access.bind(state,agent.id,supplier.descriptor.id);await access.authorize(binding);const entry=await skillService(agent,{supplierId:supplier.descriptor.id,priceCents:state.policy.maxTaskBudget,revision:await workflowBindingHash(binding)});catalog.push(entry);bindings.set(entry.id,binding);}catch{}
 return {plugins,catalog,bindings,repairRuntime:()=>configuredMixedRuntime(request,owner)};
}
export async function configuredMixedRuntime(request:Request,owner:string):Promise<MixedRuntime>{
 const configured=await configuredOrderChain(request),suppliers=workflowSupplierAccess(configured,await digest({workspace:owner}));
 return {chain:configured.chain,publish:workflowPublisher(configured),orderOptions:configured,suppliers,pluginContext:()=>configuredPluginPurchaseContext(request),plugins:()=>configuredPluginPurchaseRuntime(request),checkInput:input=>checkInputSource(request,input)};
}
export function scheduleMixed(owner:string,state:Workspace,request:Request){if(!pendingMixed(state).length)return;after(async()=>{for(const f of pendingMixed(state).slice(0,2))try{await runMixedWorkflow(mixedStore(),owner,f.id,()=>configuredMixedRuntime(request,owner));}catch{console.error('[agentos] Mixed workflow awaits durable recovery.');}});}
