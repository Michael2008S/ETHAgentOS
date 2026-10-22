import test from 'node:test';import assert from 'node:assert/strict';
import {digest} from '../lib/agentos/engine.ts';
import {mixedTerms} from '../lib/agentos/mixed-workflow.ts';
import {monitorTerms} from '../lib/agentos/usdc-monitor-state.ts';
import {completedMonitorRepair} from '../lib/agentos/monitor-repair.ts';
async function fixture(){
 const source={id:'source',version:'agentos.mixed-workflow.v1',buyer:'0x'+'1'.repeat(40),steps:[],status:'failed',repairedBy:'first'},first={...source,id:'first',repair:{sourceId:'source'},repairedBy:'last'},last={...source,id:'last',status:'completed',repair:{sourceId:'first'}};delete last.repairedBy;
 for(const f of [source,first,last])f.termsHash=await digest(mixedTerms(f));
 const monitor={version:'agentos.usdc-monitor.v1',id:'monitor',draft:{account:source.buyer},status:'expired',reports:[{workflowId:'source',status:'failed'}]};monitor.draftHash=await digest(monitor.draft);monitor.termsHash=await digest(monitorTerms(monitor));return {state:{usdcMonitors:[monitor],mixedWorkflows:[source,first,last]},source,first,last,monitor};
}
test('expired and stopped monitors resolve the final completed repair after intermediate failure',async()=>{const f=await fixture();assert.equal((await completedMonitorRepair(f.state,'monitor')).repaired.id,'last');f.monitor.status='stopped';assert.equal((await completedMonitorRepair(f.state,'monitor')).repaired.id,'last');f.last.status='failed';await assert.rejects(completedMonitorRepair(f.state,'monitor'),/latest/);});
test('monitor repair refuses mismatched or cyclic successor lineage and modified terms',async()=>{const f=await fixture();f.first.repair.sourceId='unrelated';f.first.termsHash=await digest(mixedTerms(f.first));await assert.rejects(completedMonitorRepair(f.state,'monitor'),/lineage/);const g=await fixture();g.last.repairedBy='source';await assert.rejects(completedMonitorRepair(g.state,'monitor'),/lineage/);const h=await fixture();h.last.buyer='0x'+'2'.repeat(40);await assert.rejects(completedMonitorRepair(h.state,'monitor'),/terms|lineage/);});
