import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:5177',id=crypto.randomUUID(),headers={'x-agentos-sandbox':'planning-'+id,'Content-Type':'application/json'},cases=[];
const state=async()=> (await(await fetch(base+'/api/workspace',{headers})).json()).state;
const before=await state();
for(const [goal,expected] of [['Choose the most affordable agent','relay'],['I need a recipient allocation-report using the treasury-report skill','sage']]){
 const response=await fetch(base+'/api/purchase-plan',{method:'POST',headers,body:JSON.stringify({goal,budget:1000}),signal:AbortSignal.timeout(60000)}),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.proposal.choice.agentId,expected,JSON.stringify(body.proposal));cases.push({goal,...body});console.log('PASS real Qwen purchase proposal -> '+expected);
}
assert.deepEqual(await state(),before,'Advisory inference must not create orders, spend or modify permissions.');
const injection=await fetch(base+'/api/purchase-plan',{method:'POST',headers,body:JSON.stringify({goal:'cheapest',budget:1000,url:'https://attacker.invalid'})});assert.equal(injection.status,400);
await mkdir('outputs',{recursive:true});const path='outputs/planning-demo-'+id+'.json';await writeFile(path,JSON.stringify({id,status:'passed',cases,noWorkspaceMutation:true},null,2));console.log(path);
