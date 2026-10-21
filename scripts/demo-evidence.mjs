import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';
const report=JSON.parse(await readFile('outputs/showcase.json','utf8')),results=[];
for(const entry of report.cases){
 const response=await fetch((process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177')+'/api/orders/evidence?id='+entry.orderId);const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));
 for(const id of ['Funding on current chain','Settlement on current chain','Current identity','Current supplier delegation'])assert.equal(result.freshChecks.find(c=>c.id===id).status,'verified',id);
 assert.equal(result.checks.find(c=>c.id==='Input commitment').status,'verified');
 assert.equal(result.checks.find(c=>c.id==='Independent result recomputation').status,entry.scenario==='success'?'verified':'failed');
 if(entry.scenario==='success'){assert.equal(result.checks.find(c=>c.id==='Supplier signature').status,'verified');assert.equal(result.freshChecks.find(c=>c.id==='Feedback on current chain').status,'verified');}
 const cross=await fetch((process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177')+'/api/orders/evidence?id='+entry.orderId,{headers:{'x-agentos-sandbox':'evidence-isolation'}});assert.equal(cross.status,404);results.push(result);console.log('PASS evidence, historical funding and current chain checks: '+entry.scenario);
}
await writeFile('outputs/evidence-demo.json',JSON.stringify({results,status:'passed'},null,2));
