import {after} from 'next/server';
import {mixedStore,configuredMixedContext,configuredMixedRuntime} from './mixed-workflow-runtime';
import {configuredDataRpcURL,configuredDataReplay} from './data-runtime';
import {scanUSDCWindow} from './usdc-monitor-source';
import {pendingMonitors} from './usdc-monitor-state';
import {runUSDCMonitor,type MonitorRuntime} from './usdc-monitor-runner';
import type {Workspace} from './types';
export const configuredMonitorRuntime=(request:Request,owner:string):MonitorRuntime=>({context:async()=>configuredMixedContext(request,owner,(await mixedStore().read(owner)).state),mixed:()=>configuredMixedRuntime(request,owner),scan:m=>scanUSDCWindow(configuredDataRpcURL(request),m,fetch,configuredDataReplay(request))});
export function scheduleMonitors(request:Request,owner:string,state:Workspace){if(!pendingMonitors(state).length)return;after(async()=>{for(const m of pendingMonitors(state).slice(0,2))try{await runUSDCMonitor(mixedStore(),owner,m.id,async()=>configuredMonitorRuntime(request,owner));}catch{console.error('[agentos] USDC monitor awaits durable recovery.');}});}
