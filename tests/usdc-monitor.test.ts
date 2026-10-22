import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scanUSDCWindow} from '../lib/agentos/usdc-monitor-source.ts';
import {futureMonitorTickets,monitorReservations,handoffMonitor,controlMonitor,type USDCMonitor} from '../lib/agentos/usdc-monitor-state.ts';
import type {Workspace} from '../lib/agentos/types.ts';
const hash='0x'+'a'.repeat(64),other='0x'+'b'.repeat(64);
test('USDC cursor waits, advances empty windows without purchases, halves dense windows and stops on changed anchors or single-block overflow',async()=>{
 let calls=0,dense=false,changed=false;const request:typeof fetch=async(_url,init)=>{const {method,params}=JSON.parse(String(init?.body));calls++;let result:unknown;if(method==='eth_chainId')result='0x1';else if(method==='eth_getBlockByNumber')result={number:params[0]==='finalized'?'0x64':params[0],hash:changed?other:hash};else if(method==='eth_getLogs')result=dense?Array(26).fill({}):[];else throw Error(method);return Response.json({jsonrpc:'2.0',id:1,result});};
 const m={cursor:90,draft:{account:'0x'+'1'.repeat(40),windowBlocks:10}} as USDCMonitor;
 assert.deepEqual(await scanUSDCWindow('https://rpc.example',m,request),{kind:'empty',from:90,to:99,endHash:hash,finalized:100});assert.equal(calls,4);
 m.cursor=101;assert.equal((await scanUSDCWindow('https://rpc.example',m,request)).kind,'waiting');m.cursor=90;m.anchor={number:89,hash};changed=true;await assert.rejects(scanUSDCWindow('https://rpc.example',m,request),/anchor changed/);changed=false;dense=true;await assert.rejects(scanUSDCWindow('https://rpc.example',m,request),/no events were truncated/);
});
test('monitor reservations transfer only with the exact leased child; pause reserves future work and stop cancels only active children',()=>{
 const draft={requestId:crypto.randomUUID(),input:{value:1}},m={id:'monitor-1',status:'running',expiresAt:new Date(Date.now()+60000).toISOString(),draft:{maxReports:2,vaultSessionId:'vault'},services:[{priceCents:360},{priceCents:100}],reports:[],lease:{token:'token',until:new Date(Date.now()+60000).toISOString()},pending:{draft,from:1,to:2,endHash:hash,sourceHash:hash}} as unknown as USDCMonitor,state={usdcMonitors:[m],mixedWorkflows:[]} as unknown as Workspace;
 assert.equal(futureMonitorTickets(state).length,2);assert.equal(monitorReservations(state).reduce((n,r)=>n+r.quote,0),920);assert.throws(()=>handoffMonitor(state,{id:m.id,token:'wrong'},draft as never),/permission or lease/);assert.throws(()=>handoffMonitor(state,{id:m.id,token:'token'},{...draft,title:'changed'} as never),/permission or lease/);const next=handoffMonitor(state,{id:m.id,token:'token'},draft as never);assert.equal(futureMonitorTickets(next).length,1);assert.equal(next.usdcMonitors![0].reports.length,1);assert.equal(next.usdcMonitors![0].pending,undefined);assert.equal(state.usdcMonitors![0].reports.length,0);
 next.mixedWorkflows=[{id:'mixed-'+draft.requestId,status:'running',steps:[{status:'pending'},{status:'active',childId:'paid-child'}]}] as never;const paused=controlMonitor(next,m.id,'pause');assert.equal(futureMonitorTickets(paused).length,1);const stopped=controlMonitor(paused,m.id,'stop');assert.equal(futureMonitorTickets(stopped).length,0);assert.equal(stopped.mixedWorkflows![0].status,'cancelling');assert.equal(stopped.mixedWorkflows![0].steps[0].status,'cancelled');assert.equal(stopped.mixedWorkflows![0].steps[1].childId,'paid-child');assert.throws(()=>controlMonitor(stopped,m.id,'resume'),/stopping/);
});

import {pendingMonitors} from '../lib/agentos/usdc-monitor-state.ts';
import {workItems} from '../lib/agentos/queue.ts';
test('paused monitors retain an expiry wake-up even without an active report',()=>{const expired={id:'paused',status:'paused',expiresAt:new Date(Date.now()-1000).toISOString(),reports:[]} as never,state={usdcMonitors:[expired],tasks:[]} as unknown as Workspace;assert.equal(pendingMonitors(state).length,1);const item=workItems(state).find(j=>j.taskId==='paused');assert.ok(item&&item.notBefore<=Date.now());});
