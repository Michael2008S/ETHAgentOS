import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {dataRpc,verifyTransferSource} from '../lib/agentos/chain-data.ts';
import {USDC_ADDRESS,TRANSFER_TOPIC} from '../lib/agentos/transfer-source.ts';
import {AgentOSClient} from '../sdk/index.ts';
import {AgentWalletSession,deliveryBytes,localWalletProvider} from '../sdk/wallet.ts';
import {startLocalChain} from './local-chain.mjs';
const base=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177',url=process.env.AGENTOS_DATA_RPC_URL||'https://ethereum-rpc.publicnode.com';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Use a loopback demo workspace.');
const id=crypto.randomUUID(),headers={'x-agentos-sandbox':'source-'+id,'Content-Type':'application/json'},report={id,scope:'read-only Ethereum mainnet source; temporary local EVM service payment',startedAt:new Date().toISOString(),cases:[]};let local;
try{
 const rpc=dataRpc(url),final=await rpc('eth_getBlockByNumber',['finalized',false]);
 const logs=await rpc('eth_getLogs',[{address:USDC_ADDRESS,fromBlock:final.number,toBlock:final.number,topics:[TRANSFER_TOPIC]}]);
 console.log('READ finalized block '+final.number+' ('+logs.length+' USDC events)');assert.ok(logs.length,'Finalized block has no USDC events; retry with a later block.');
 const selected=logs[0],account='0x'+selected.topics[2].slice(-40),block=Number(BigInt(final.number));
 const imported=await fetch(base+'/api/data',{method:'POST',headers,body:JSON.stringify({account,direction:'incoming',blockFrom:block,blockTo:block}),signal:AbortSignal.timeout(120000)});
 const data=await imported.json();report.imported=data;console.log('IMPORT HTTP '+imported.status);assert.equal(imported.status,200,JSON.stringify(data));await verifyTransferSource(url,data.input.source);console.log('PASS independent Node source reverification');
 const os=new AgentOSClient(base,headers),task=await os.createTask({requestId:id,agentId:'sage',title:'Actual USDC treasury flow',budget:1000,input:data.input}),done=await os.run(task.id,{timeoutMs:60000});assert.equal(done.status,'completed');assert.ok(done.output.source.totalBaseUnits);
 report.cases.push({scenario:'actual-rpc-import-and-server-execution',input:done.input,output:done.output,taskId:done.id,passed:true});
 console.log('PASS real finalized USDC import and HTTP/D1 treasury analysis');
 local=await startLocalChain({port:0});const wallet=await AgentWalletSession.connect(localWalletProvider(local.base),local.config,false),bytes=deliveryBytes(done,wallet.account);
 const post=async(path,body)=>{const r=await fetch(local.base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d;};
 const spec=await post('/deliveries',bytes),funding=await wallet.fund(done,spec),verdict=await post('/verify',{id:bytes.id}),settlement=await wallet.evidence(done,verdict.hash,'settlement',spec);assert.equal(settlement.status,'paid');
 report.cases.push({scenario:'complete-provenance-artifact-local-escrow',funding,settlement,accepted:verdict.accepted,passed:true});
 console.log('PASS full provenance artifact independently accepted and paid on temporary local EVM');report.status='passed';
}catch(error){report.status='failed';report.error=error.message;console.error(error.message);process.exitCode=1;}
finally{await local?.close();report.finishedAt=new Date().toISOString();await mkdir('outputs',{recursive:true});const file='outputs/data-demo-'+id+'.json';await writeFile(file,JSON.stringify(report,null,2));console.log('Evidence: '+file);}
