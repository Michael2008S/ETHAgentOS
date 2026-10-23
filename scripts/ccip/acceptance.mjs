import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decodeAbiParameters,encodeAbiParameters,zeroAddress} from 'viem';
import {createCCIPFixture} from './local-fixture.mjs';
import {Journal} from '../x402/storage.mjs';

export async function runCCIPAcceptance(onCheck=()=>{}){
 const f=await createCCIPFixture(),{a,b}=f,checks=[],directory=mkdtempSync(join(tmpdir(),'agentos-ccip-'));
 let journal;
 const check=(name)=>{checks.push({name,passed:true});onCheck(name);};
 const reserve=c=>c.read(c.lane,'reserved');
 const deny=(c,address,functionName,args,reason)=>assert.rejects(c.client.simulateContract({account:c.owner,address,abi:c.abis.get(address),functionName,args}),new RegExp(reason));
 const fresh=(m,label)=>({...m,messageId:f.id(label)});
 const payloadType=[{type:'tuple',components:[{name:'kind',type:'uint8'},{name:'id',type:'bytes32'},{name:'amount',type:'uint256'},{name:'expires',type:'uint64'},{name:'spec',type:'bytes32'},{name:'accepted',type:'bool'},{name:'output',type:'bytes32'}]}];
 const altered=(m,label,changes)=>({...fresh(m,label),data:encodeAbiParameters(payloadType,[{...decodeAbiParameters(payloadType,m.data)[0],...changes}])});
 try {
  assert.notEqual(await a.client.getChainId(),await b.client.getChainId());
  const id=f.id('primary'),[auth]=await f.authorize(id);
  await deny(b,b.lane,'ccipReceive',[auth],'wrong router');
  await deny(b,b.router,'deliver',[b.lane,{...auth,sourceChainSelector:999n}],'wrong source');
  await deny(b,b.router,'deliver',[b.lane,{...auth,sender:encodeAbiParameters([{type:'address'}],[zeroAddress])}],'wrong sender');
  await deny(b,b.router,'deliver',[b.lane,{...auth,sender:'0x'}],'wrong sender');
  assert.equal(await b.read(b.lane,'received',[auth.messageId]),false);
  assert.equal(await reserve(b),0n);check('reject wrong Router, source selector, sender and malformed sender before consuming message');

  assert.equal(await reserve(a),1_000_000n);assert.equal((await f.task(b,id))[3],0);
  await a.provider.request({method:'evm_increaseTime',params:[60]});await a.provider.request({method:'evm_mine',params:[]});
  assert.equal(await reserve(a),1_000_000n);check('delayed authorization keeps A budget reserved without timeout release');
  await f.deliver(b,auth);
  await deny(b,b.router,'deliver',[b.lane,altered(auth,'changed-terms',{amount:2_000_000n})],'terms mismatch');
  await deny(b,b.router,'deliver',[b.lane,altered(auth,'early-ack',{kind:4})],'unexpected ack');
  await f.deliver(b,auth);await f.deliver(b,fresh(auth,'semantic-auth-retry'));
  assert.equal(await reserve(b),1_000_000n);
  await b.tx(b.lane,'execute',[id]);await deny(b,b.lane,'execute',[id],'not executable');
  check('transport and business duplicates cannot reserve or execute twice');
  const [result]=await f.settle(id,true);
  assert.equal(await reserve(a),1_000_000n);assert.equal(await reserve(b),1_000_000n);
  const [ack]=await f.messages(a,await f.deliver(a,result));
  await f.deliver(a,result);assert.equal(await reserve(a),0n);assert.equal(await reserve(b),1_000_000n);
  // Simulate a relayer crash after destination mined but before local delivery receipt was committed.
  journal=new Journal(join(directory,'relay.sqlite'));journal.put('outbox',ack.messageId,{message:JSON.stringify(ack,(_,v)=>typeof v==='bigint'?v.toString():v),status:'pending'});
  await f.deliver(b,ack);journal.close();journal=new Journal(join(directory,'relay.sqlite'));
  const saved=journal.get('outbox',ack.messageId),recovered=JSON.parse(saved.message);recovered.sourceChainSelector=BigInt(recovered.sourceChainSelector);
  assert.equal(saved.status,'pending');await f.deliver(b,recovered);journal.put('outbox',ack.messageId,{...saved,status:'delivered'});
  assert.equal(await reserve(b),0n);assert.equal(await b.read(b.token,'balanceOf',[b.seller]),1_000_000n);
  check('durable relay journal reopen and retry after mined-before-checkpoint crash settle once');
  const [retryResult]=await f.messages(b,await b.tx(b.lane,'resend',[id]));
  await f.roundtrip(retryResult);await f.deliver(b,ack);
  await deny(a,a.router,'deliver',[a.lane,altered(result,'conflicting-result',{accepted:false})],'conflicting result');
  check('reject modified task terms, ACK before settlement and conflicting terminal results');assert.equal(await reserve(b),0n);
  check('lost result or ACK recovers through resend; duplicate results and ACKs are idempotent');

  const rev=f.id('revoke-before-auth'),[oldAuth]=await f.authorize(rev);
  const [revoke]=await f.messages(a,await a.tx(a.lane,'revoke',[rev]));assert.equal(await reserve(a),1_000_000n);
  const [cancelled]=await f.messages(b,await f.deliver(b,revoke));
  await f.deliver(b,oldAuth);await deny(b,b.lane,'execute',[rev],'not executable');
  assert.equal((await f.task(b,rev))[4],true);await f.roundtrip(cancelled);
  check('out-of-order revoke before authorization leaves a tombstone and refunds only after result');

  const failed=f.id('failed-local-execution'),[failureAuth]=await f.authorize(failed);
  await f.deliver(b,failureAuth);await b.tx(b.vault,'revoke',[b.lane]);
  await deny(b,b.lane,'execute',[failed],'executor limit');
  assert.equal((await f.task(b,failed))[3],2);assert.equal(await reserve(b),1_000_000n);
  await b.tx(b.vault,'grant',[b.lane,3_000_000n,f.cap,f.deadline+3600n]);
  await b.tx(b.lane,'execute',[failed]);
  const [revokeExecuting]=await f.messages(a,await a.tx(a.lane,'revoke',[failed]));await f.deliver(b,revokeExecuting);
  await deny(b,b.lane,'collect',[failed],'unsettled');
  const beforeRefund=await b.read(b.token,'balanceOf',[b.vault]);
  const [failureResult]=await f.settle(failed,false);assert.equal(await b.read(b.token,'balanceOf',[b.vault]),beforeRefund+1_000_000n);
  assert.equal(await reserve(b),1_000_000n);await f.roundtrip(failureResult);
  check('local grant revocation rolls back execution; restoration retries once; failed delivery refunds B Vault');

  // Hold an ACK, freeing A capacity while B must still reserve its corresponding amount.
  const hold=f.id('held-ack'),[holdAuth]=await f.authorize(hold);await f.deliver(b,holdAuth);await b.tx(b.lane,'execute',[hold]);
  const [holdResult]=await f.settle(hold,false),[heldAck]=await f.messages(a,await f.deliver(a,holdResult));
  const large=f.id('backpressure'),[largeAuth]=await f.authorize(large,f.cap-1_000_000n);
  await deny(b,b.router,'deliver',[b.lane,largeAuth],'local budget');assert.equal(await b.read(b.lane,'received',[largeAuth.messageId]),false);
  await f.deliver(b,heldAck);await f.deliver(b,largeAuth);assert.equal(await reserve(b),f.cap-1_000_000n);
  const [largeRevoke]=await f.messages(a,await a.tx(a.lane,'revoke',[large]));const [largeResult]=await f.messages(b,await f.deliver(b,largeRevoke));await f.roundtrip(largeResult);
  check('B enforces independent capacity; over-budget message stays retryable until pending ACK releases reserve');

  const expired=f.id('expired-authorization'),expires=(await a.client.getBlock({blockTag:'latest'})).timestamp+30n;
  const [expiryAuth]=await f.authorize(expired,1_000_000n,expires);
  await b.provider.request({method:'evm_increaseTime',params:[180]});await b.provider.request({method:'evm_mine',params:[]});
  const [expiredResult]=await f.messages(b,await f.deliver(b,expiryAuth));await deny(b,b.lane,'execute',[expired],'not executable');
  assert.equal(await reserve(a),1_000_000n);await f.roundtrip(expiredResult);
  check('authorization arriving after expiry cannot execute; authenticated cancellation releases budgets');

  await deny(a,a.lane,'authorize',[f.id('too-large'),f.cap+1n,f.deadline,f.spec],'local budget');
  assert.equal(await reserve(a),0n);assert.equal(await reserve(b),0n);
  assert.equal(await a.read(a.token,'balanceOf',[a.vault]),f.cap);
  assert.equal(await b.read(b.token,'balanceOf',[b.vault]),f.cap-1_000_000n);
  assert.equal(await b.read(b.token,'balanceOf',[b.seller]),1_000_000n);
  assert.equal(await b.read(b.token,'balanceOf',[b.escrow]),0n);
  const opened=await b.client.getContractEvents({address:b.escrow,abi:b.abis.get(b.escrow),eventName:'Opened',fromBlock:0n});assert.equal(opened.length,3);
  const timeout=f.id('funded-timeout'),[timeoutAuth]=await f.authorize(timeout);
  await f.deliver(b,timeoutAuth);await b.tx(b.lane,'execute',[timeout]);
  await b.provider.request({method:'evm_increaseTime',params:[4000]});await b.provider.request({method:'evm_mine',params:[]});
  await b.tx(b.escrow,'refundExpired',[timeout]);
  assert.equal(await reserve(a),1_000_000n);assert.equal(await reserve(b),1_000_000n);
  const [timeoutResult]=await f.messages(b,await b.tx(b.lane,'collect',[timeout]));await f.roundtrip(timeoutResult);
  assert.equal(await reserve(a),0n);assert.equal(await reserve(b),0n);
  assert.equal(await b.read(b.token,'balanceOf',[b.vault]),f.cap-1_000_000n);
  check('funded worker timeout refunds only through local Escrow; cross-chain budgets wait for result and ACK');
  const finalOpened=await b.client.getContractEvents({address:b.escrow,abi:b.abis.get(b.escrow),eventName:'Opened',fromBlock:0n});assert.equal(finalOpened.length,4);
  check('final conservation: A unchanged, B pays once and refunds three times, escrow empty, no pending reserves');
  return {passed:true,scope:'Two independent in-process EVMs and privileged local Mock Routers; application state machine only',chains:[{chainId:a.chainId,selector:a.selector.toString(),lane:a.lane,vault:a.vault},{chainId:b.chainId,selector:b.selector.toString(),lane:b.lane,vault:b.vault}],checks,final:{aVault:f.cap.toString(),bVault:(f.cap-1_000_000n).toString(),bSeller:'1000000',aReserved:'0',bReserved:'0',opened:finalOpened.length},realCCIPNetworkAccepted:false,cleanup:{rpcPortsOpened:0,childProcessesStarted:0,evmsDisconnected:true,relayJournalRemoved:true}};
 } finally {journal?.close();await f.close();rmSync(directory,{recursive:true,force:true});}
}
