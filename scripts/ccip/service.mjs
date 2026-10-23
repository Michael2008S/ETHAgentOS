import {fileURLToPath} from 'node:url';
import {decodeAbiParameters,encodeAbiParameters,zeroHash} from 'viem';
import {createCCIPFixture} from './local-fixture.mjs';
import {Journal} from '../x402/storage.mjs';
import {localServer,readJson} from '../x402/http.mjs';
import {expectedOutput,digest} from '../../lib/agentos/engine.ts';
import {ccipDelivery,verifyCCIPJob} from '../../lib/agentos/ccip-tasks.ts';
import {deliveryArtifact,verifyDelivery,canonical} from '../../cre/workflow/verify.ts';
const payload=[{type:'tuple',components:[{name:'kind',type:'uint8'},{name:'id',type:'bytes32'},{name:'amount',type:'uint256'},{name:'expires',type:'uint64'},{name:'spec',type:'bytes32'},{name:'accepted',type:'bool'},{name:'output',type:'bytes32'}]}];
const wire=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v));
export async function startCCIPService({root,port=0,appOrigin='http://127.0.0.1:5177',faults={}}){
 if(!root||new URL(appOrigin).hostname!=='127.0.0.1')throw Error('Persistent local CCIP root and origin required.');
 const store=new Journal(root+'/journal.sqlite'),oldBinding=store.get('meta','binding');
 if(oldBinding&&oldBinding.appOrigin!==appOrigin){store.close();throw Error('CCIP origin binding changed.');}
 let f,server,serial=Promise.resolve();
 try{
  f=await createCCIPFixture({root:root+'/chains'});const {a,b}=f;
  const config={version:'agentos.local-ccip.v1',...Object.fromEntries([['a',a],['b',b]].map(([key,c])=>[key,{chainId:c.chainId,selector:c.selector.toString(),...Object.fromEntries(['token','escrow','vault','router','lane','seller'].map(k=>[k,c[k].toLowerCase()]))}]))};
  async function observe(job){
   const [at,bt,escrow,ablock,bblock,ar,br]=await Promise.all([f.task(a,job.chainTaskId),f.task(b,job.chainTaskId),b.read(b.escrow,'tasks',[job.chainTaskId]),a.client.getBlock({blockTag:'latest'}),b.client.getBlock({blockTag:'latest'}),a.read(a.lane,'reserved'),b.read(b.lane,'reserved')]);
   const saved=store.get('jobs',job.chainTaskId);if(saved&&at[3]===5&&[0,5].includes(bt[3]))store.put('jobs',job.chainTaskId,{...saved,finalized:true});
   return {aPhase:at[3],bPhase:bt[3],escrowStatus:escrow[5],accepted:at[5],outputHash:at[6],...(saved?.artifactText?{artifactText:saved.artifactText,datasetText:saved.datasetText}:{}),blocks:{a:{number:ablock.number.toString(),hash:ablock.hash},b:{number:bblock.number.toString(),hash:bblock.hash}},aReserved:ar.toString(),bReserved:br.toString()};
  }
  async function drive(job){
   await verifyCCIPJob(job);if(await digest(job.deployment)!==await digest(config))throw Error('CCIP deployment changed.');
   let saved=store.get('jobs',job.chainTaskId);
   if(saved&&saved.job.termsHash!==job.termsHash)throw Error('Immutable CCIP terms differ.');
   if(!saved){if(store.entries('jobs').length>=1000)throw Error('CCIP durable history capacity reached.');saved={job:wire(job),cancelRequested:job.cancelRequested};}
   saved.cancelRequested||=job.cancelRequested;store.put('jobs',job.chainTaskId,saved);
   const at=await f.task(a,job.chainTaskId),amount=BigInt(job.draft.budgetCents)*10000n,expires=BigInt(Math.floor(Date.parse(job.expiresAt)/1000));
   if(at[3]===0){await a.tx(a.lane,saved.cancelRequested?'cancelUnsent':'authorize',[job.chainTaskId,amount,expires,job.termsHash]);return observe(job);}
   if(saved.cancelRequested&&at[3]===1&&!at[4]){await a.tx(a.lane,'revoke',[job.chainTaskId]);return observe(job);}
   // Rebuild the durable outbox from on-chain Router events after any crash gap.
   for(const [source,target]of [[a,b],[b,a]]){
    const logs=await source.client.getContractEvents({address:source.router,abi:source.abis.get(source.router),eventName:'Sent',fromBlock:0n});
    if(logs.length>10000)throw Error('CCIP event history capacity reached; archive before new work.');
    for(const log of logs){const data=decodeAbiParameters(payload,log.args.data)[0];if(data.id!==job.chainTaskId||store.get('messages',log.args.messageId)?.delivered)continue;
     store.put('messages',log.args.messageId,{delivered:false,source:source.chainId,kind:data.kind});
     if(faults.holdKinds?.includes(data.kind))return observe(job);
     const message={messageId:log.args.messageId,sourceChainSelector:source.selector,sender:encodeAbiParameters([{type:'address'}],[log.args.sender]),data:log.args.data,destTokenAmounts:[]};
     await f.deliver(target,message);await faults.afterDelivery?.(data.kind);store.put('messages',log.args.messageId,{delivered:true,source:source.chainId,kind:data.kind});return observe(job);
    }
   }
   const bt=await f.task(b,job.chainTaskId);
   if(bt[3]===2){if(Date.now()>=Date.parse(job.expiresAt)||bt[4])await b.tx(b.lane,'collect',[job.chainTaskId]);else await b.tx(b.lane,'execute',[job.chainTaskId]);return observe(job);}
   if(bt[3]===3){
    let status=(await b.read(b.escrow,'tasks',[job.chainTaskId]))[5];
    if(status===1){
     const {datasetText,spec}=ccipDelivery(job,server.base),output=expectedOutput({skill:'treasury-report',input:job.draft.input});
     if(job.draft.scenario==='invalid-delivery')output.totalCents++;
     const artifactText=canonical(deliveryArtifact(job.chainTaskId,spec.verification,spec.datasetHash,output)),verdict=verifyDelivery(datasetText,artifactText,job.chainTaskId,spec);
     saved={...saved,datasetText,artifactText};store.put('jobs',job.chainTaskId,saved);
     if((await b.client.getBlock({blockTag:'latest'})).timestamp>=expires)await b.tx(b.escrow,'refundExpired',[job.chainTaskId]);
     else await b.tx(b.escrow,'onReport',[f.metadata,encodeAbiParameters([{type:'bytes32'},{type:'bytes32'},{type:'bytes32'},{type:'bool'}],[job.chainTaskId,job.termsHash,saved.cancelRequested?zeroHash:verdict.outputHash,verdict.accepted&&!saved.cancelRequested])]);
     await faults.afterSettlement?.();status=(await b.read(b.escrow,'tasks',[job.chainTaskId]))[5];
    }
    if([2,3].includes(status))await b.tx(b.lane,'collect',[job.chainTaskId]);
   }
   return observe(job);
  }
  const allowedRPC=new Set(['eth_chainId','eth_call','eth_getBlockByNumber','eth_getBlockByHash','eth_getTransactionReceipt','eth_getLogs','eth_getCode','eth_blockNumber']);
  server=await localServer(async(req,json)=>{
   if(req.method==='GET'&&req.url==='/health'){
    const jobs=store.rows('jobs');
    for(const row of jobs.filter(j=>!j.finalized)){const [at,bt]=await Promise.all([f.task(a,row.job.chainTaskId),f.task(b,row.job.chainTaskId)]);if(at[3]===5&&[0,5].includes(bt[3])){row.finalized=true;store.put('jobs',row.job.chainTaskId,row);}}
    const pending=jobs.filter(j=>!j.finalized),now=BigInt(Math.floor(Date.now()/1000)),grant=await b.read(b.vault,'grants',[b.lane]),balance=await b.read(b.token,'balanceOf',[b.vault]),reserved=await b.read(b.lane,'reserved'),spent=await b.read(b.vault,'spent',[b.lane,now/86400n]);
    const alerts=[];if(grant[2]<=now||grant[0]===0n)alerts.push('ccip-grant-expired');if(spent>=grant[1]||balance<=reserved)alerts.push('ccip-budget-capacity');if(jobs.length>=800)alerts.push('ccip-history-capacity');if(pending.some(j=>Date.now()-Date.parse(j.job.createdAt)>60000))alerts.push('ccip-pending-over-60s');
    return json(200,{status:'ok',version:config.version,localMock:true,jobs:jobs.length,pending:pending.length,alerts,newExecutionAllowed:!alerts.some(a=>['ccip-grant-expired','ccip-budget-capacity'].includes(a)),capacity:{jobs:jobs.length,jobLimit:1000,balance:balance.toString(),reserved:reserved.toString(),dailySpent:spent.toString(),dailyLimit:grant[1].toString(),grantExpires:grant[2].toString()}});
   }
   if(req.method==='GET'&&req.url==='/config')return json(200,config);
   if(req.method!=='POST')return json(404,{error:'not found'});
   const body=await readJson(req,32768);
   if(['/chain/a','/chain/b'].includes(req.url)){if(!allowedRPC.has(body.method))return json(403,{error:'read-only RPC'});const c=req.url.endsWith('/a')?a:b;return json(200,{jsonrpc:'2.0',id:body.id,result:await c.provider.request({method:body.method,params:body.params??[]})});}
   if(req.url==='/step'){
    const next=serial.then(()=>drive(body));serial=next.catch(()=>{});return json(200,wire(await next));
   }
   return json(404,{error:'not found'});
  },oldBinding?Number(new URL(oldBinding.origin).port):port);
  if(oldBinding&&oldBinding.origin!==server.base)throw Error('CCIP transport origin changed.');store.put('meta','binding',{appOrigin,origin:server.base});
  return {base:server.base,config,store,faults,fixture:f,observe,close:async()=>{await server.close();await serial;await f.close();store.close();}};
 }catch(error){await server?.close();await f?.close();store.close();throw error;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const service=await startCCIPService({root:process.env.AGENTOS_CCIP_STATE,port:Number(process.env.AGENTOS_CCIP_PORT),appOrigin:process.env.AGENTOS_APP_ORIGIN});console.log('Local CCIP service ready '+service.base);let closing=false;
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;await service.close();});
}
