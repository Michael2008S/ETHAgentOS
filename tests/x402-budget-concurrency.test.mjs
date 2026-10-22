import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';
import {ProcurementStore} from '../scripts/x402/procurement-store.mjs';
test('two separate workspace processes share one procurement budget transaction',async()=>{
 const root=await mkdtemp(tmpdir()+'/x402-shared-budget-'),path=root+'/budget.sqlite',moduleURL=new URL('../scripts/x402/procurement-store.mjs',import.meta.url).href;new ProcurementStore(path).close();
 const code=`import {ProcurementStore} from ${JSON.stringify(moduleURL)};const store=new ProcurementStore(process.argv[1]);try{store.reserve(process.argv[2],{network:'eip155:31337',asset:'one-token',payer:'one-supplier-wallet',jobId:process.argv[2]},'20','30');console.log('reserved');}catch(error){if(!/daily cap/.test(error.message))throw error;console.log('denied');}finally{store.close();}`;
 const run=job=>new Promise((ok,no)=>{const child=spawn(process.execPath,['--input-type=module','-e',code,path,job],{stdio:['ignore','pipe','pipe']});let out='',error='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>error+=b);child.on('error',no);child.on('close',exit=>exit===0?ok(out.trim()):no(Error(error)));});
 try{assert.deepEqual((await Promise.all([run('workspace-A'),run('workspace-B')])).sort(),['denied','reserved']);const store=new ProcurementStore(path);try{assert.deepEqual(store.summary(),{spent:'0',reserved:'20',purchases:1});}finally{store.close();}}finally{await rm(root,{recursive:true,force:true});}
});
