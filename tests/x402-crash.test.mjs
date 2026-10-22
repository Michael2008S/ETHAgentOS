import test from 'node:test';import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';import {spawn} from 'node:child_process';
import {x402Fixture} from './x402-fixture.mjs';
import {localServer,readJson} from '../scripts/x402/http.mjs';
import {authorizationABI} from '../scripts/x402/protocol.mjs';
import {digest} from '../lib/agentos/engine.ts';
test('SIGKILL before send and after mined payment resumes the original durable procurement with exactly one transfer',async()=>{
 const f=await x402Fixture(),rpc=await localServer(async(req,json)=>{const b=await readJson(req);if(!['eth_chainId','eth_call','eth_getLogs','eth_getTransactionReceipt','eth_getBlockByNumber','eth_blockNumber'].includes(b.method))return json(403,{});json(200,{jsonrpc:'2.0',id:b.id,result:await f.provider.request({method:b.method,params:b.params})});});
 const child=path=>new Promise((ok,no)=>{const p=spawn(process.execPath,['tests/x402-procurement-child.mjs',path],{stdio:['ignore','ignore','pipe']});let error='';p.stderr.on('data',b=>error+=b);p.once('error',no);p.once('close',(code,signal)=>ok({code,signal,error}));});
 try{for(const phase of ['before-send','after-payment']){
  const path=f.root+'/'+phase+'.json',key=f.provider.getInitialAccounts()[f.accounts[1].address.toLowerCase()].secretKey,config={key,policy:f.policy,rpc:rpc.base,store:f.root+'/'+phase+'.sqlite',marker:f.root+'/'+phase+'-marker.json',result:f.root+'/'+phase+'-result.json',request:{...f.request,jobId:await digest({phase})},phase};
  await writeFile(path,JSON.stringify(config),{mode:0o600});const killed=await child(path);assert.equal(killed.signal,'SIGKILL',killed.error);const marker=JSON.parse(await readFile(config.marker,'utf8'));if(phase==='after-payment')assert.ok(marker.payment);
  await writeFile(path,JSON.stringify({...config,phase:'resume'}),{mode:0o600});const resumed=await child(path);assert.equal(resumed.code,0,resumed.error);const result=JSON.parse(await readFile(config.result,'utf8'));assert.equal(result.report.terms.nonce,marker.nonce);if(marker.payment)assert.equal(result.payment.transaction,marker.payment);
  const events=await f.client.getContractEvents({address:f.token,abi:authorizationABI,eventName:'AuthorizationUsed',args:{authorizer:f.accounts[1].address,nonce:marker.nonce},fromBlock:0n});assert.equal(events.length,1);
 }}finally{await rpc.close();await f.close();}
});
