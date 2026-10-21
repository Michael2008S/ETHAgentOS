import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {AgentOSClient} from '../sdk/index.ts';
import {AgentWalletSession,localWalletProvider} from '../sdk/wallet.ts';
import {AgentIdentityClient} from '../sdk/agent-identity.ts';
import {AgentOrderClient} from '../sdk/orders.ts';
import {supplierRequest,supplierJobId,verifySupplierDelivery} from '../lib/agentos/supplier.ts';
import {escrowABI} from '../sdk/chain.ts';
import {skillDefinitionHash} from '../lib/agentos/skill-definition.ts';
import {verifyDelivery} from '../cre/workflow/verify.ts';
import {inputEvidence} from '../sdk/wallet.ts';
import {orderArtifact} from '../lib/agentos/orders.ts';

const base=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177',chainBase=process.env.AGENTOS_CHAIN_URL||'http://127.0.0.1:8545',supplierBase=process.env.AGENTOS_SUPPLIER_URL||'http://127.0.0.1:7461';
for(const value of [base,chainBase,supplierBase])if(new URL(value).hostname!=='127.0.0.1')throw new Error('Skill demo requires isolated loopback services.');
const definition=JSON.parse(await readFile(new URL('../examples/skills/treasury-concentration.json',import.meta.url),'utf8')),id=crypto.randomUUID(),headers={'x-agentos-sandbox':'skill-'+id},os=new AgentOSClient(base,headers),report={id,startedAt:new Date().toISOString(),scope:'actual HTTP/D1/SDK, independent reference supplier, local ERC-8004 and EVM settlement; no public deployment or DON',definition,definitionHash:skillDefinitionHash(definition),cases:[]};
let controlEnabled=false;
async function control(mode){const response=await fetch(supplierBase+'/testing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})});assert.equal(response.status,200);}
async function stats(){return(await fetch(supplierBase+'/stats')).json();}
try{
 const config=await(await fetch(chainBase+'/config')).json(),buyer=await AgentWalletSession.connect(localWalletProvider(chainBase),config,false),seller=await AgentWalletSession.connect(localWalletProvider(chainBase,'seller'),config,false),identities=new AgentIdentityClient(seller,base,headers),orders=new AgentOrderClient(buyer,base,headers),supplierResponse=await fetch(base+'/api/suppliers',{headers});assert.equal(supplierResponse.status,200);
 const descriptor=(await supplierResponse.json()).descriptor;assert.ok(descriptor.skills.includes(definition.id),'Run an isolated supplier configured with AGENTOS_SUPPLIER_SKILLS including the extension ID.');controlEnabled=true;await control('healthy');
 const before=await os.workspace();await os.installSkill(definition);await os.installSkill(definition);const installed=await os.workspace();assert.equal(installed.skillDefinitions.length,1);assert.deepEqual(installed.policy,before.policy);assert.deepEqual(installed.ledger,before.ledger);
 await assert.rejects(os.installSkill({...definition,recipe:{...definition.recipe,topN:1}}),/immutable/);
 await assert.rejects(os.installSkill({...definition,capabilities:['dataset.read','wallet.transfer']}),/definition/);
 const requestId=crypto.randomUUID(),agentId='custom-'+requestId;await os.registerAgent({name:'Concentration service',description:'Independent ranked treasury flows',skill:definition.id},requestId);
 const input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:0,from:'excluded',to:'excluded',cents:9999},{block:1,from:'treasury',to:'alice',cents:100},{block:2,from:'treasury',to:'bob',cents:300},{block:2,from:'second',to:'alice',cents:100}]};
 await assert.rejects(orders.create({agentId,title:'Not yet permitted',budget:1000,input}),/allowlist/);await os.updatePolicy({...before.policy,allowedSkills:[...before.policy.allowedSkills,definition.id]});
 report.cases.push({name:'immutable installation, explicit policy grant and new service registration',status:'passed'});
 const cross=new AgentOSClient(base,{'x-agentos-sandbox':'other-skill-'+id});assert.equal((await cross.workspace()).skillDefinitions,undefined);
 await identities.registerAndBind(agentId);await identities.authorizeSupplier((await os.workspace()).agentIdentities.find(i=>i.agentId===agentId),descriptor);
 await assert.rejects(orders.create({agentId,title:'Changed definition refused',budget:1000,input:{...input,skillDefinition:{...definition,recipe:{...definition.recipe,thresholdBps:9999}}}}),/matching/);
 async function purchase(name,executor,scenario='success'){
  const requestId=crypto.randomUUID(),draft={requestId,agentId,title:name,budget:1000,input,executor,scenario},order=await orders.create(draft),again=await orders.create(draft);assert.equal(again.id,order.id);assert.equal(order.output,null);assert.equal(order.spec.verification.skill,definition.id);assert.equal(skillDefinitionHash(order.spec.verification.skillDefinition),report.definitionHash);
  const funding=await buyer.fundOrder(order,180);await orders.activate(order,funding);await Promise.all([orders.sync(order.id),orders.sync(order.id)]);const done=await orders.wait(order.id,60000),bytes=inputEvidence(done,buyer.account),verdict=verifyDelivery(bytes.datasetText,orderArtifact(done,bytes.id),bytes.id,done.spec);
  assert.equal(done.settlement.status,scenario==='success'?'paid':'refunded');assert.equal(verdict.accepted,scenario==='success');
  const logs=await buyer.client.getContractEvents({address:config.escrow,abi:escrowABI,eventName:'Settled',args:{id:bytes.id},fromBlock:0n});assert.equal(logs.length,1);assert.deepEqual((await os.workspace()).ledger,before.ledger);
  if(scenario==='success'){assert.deepEqual(done.output.topAccounts,[{account:'bob',amountCents:300,shareBps:6000},{account:'alice',amountCents:200,shareBps:4000}]);assert.equal(done.output.concentrated,true);assert.equal(done.output.totalCents,500);}
  if(executor==='supplier'&&scenario==='success')await verifySupplierDelivery(done.supplierDelivery,await supplierRequest(done));
  report.cases.push({name,order:done,status:'passed'});return done;
 }
 await purchase('bounded runtime new skill','builtin');const delivered=await purchase('independent signed new skill','supplier');assert.equal((await stats()).requests[supplierJobId(await supplierRequest(delivered))],1);
 await purchase('incorrect new-skill delivery refunds','supplier','invalid-delivery');
 await control('lost-response');const recovered=await purchase('lost supplier response reuses new-skill delivery','supplier');assert.equal((await stats()).requests[supplierJobId(await supplierRequest(recovered))],2);
 await control('healthy');await purchase('extension capability injection refunds','supplier','injection');
 report.status='passed';for(const entry of report.cases)console.log('PASS '+entry.name);
}catch(error){report.status='failed';report.error=error.message;console.error(error.message);process.exitCode=1;}
finally{if(controlEnabled)await control('healthy').catch(()=>{});report.finishedAt=new Date().toISOString();await mkdir('outputs',{recursive:true});const path='outputs/skill-demo-'+id+'.json';await writeFile(path,JSON.stringify(report,null,2));console.log('Skill onboarding evidence: '+path);}
