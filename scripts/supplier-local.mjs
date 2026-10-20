import {sourceSummary} from '../lib/agentos/transfer-source.ts';
import { createServer } from 'node:http';
import { mkdir,open,readFile,readdir,rename,stat } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient,http,keccak256,stringToHex } from 'viem';
import { generatePrivateKey,privateKeyToAccount } from 'viem/accounts';
import { canonical,specHash } from '../cre/workflow/verify.ts';
import { AgentChainClient,centsToToken,escrowABI } from '../sdk/chain.ts';
import { inputEvidence } from '../sdk/wallet.ts';
import { identityABI } from '../sdk/identity.ts';
import { DATASET,digest,normalizeInput } from '../lib/agentos/engine.ts';
import { parseSupplierConfiguration,supplierDescriptor,supplierRequestSchema,supplierJobId,supplierReceiptMessage,supplierMetadata,SUPPLIER_METADATA_KEY,verifySupplierDelivery } from '../lib/agentos/supplier.ts';

async function writeAtomic(path,value){const temporary=path+'.'+crypto.randomUUID()+'.tmp',file=await open(temporary,'wx',0o600);try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}await rename(temporary,path);}
export async function startLocalSupplier({port=7461,runtimeRoot=resolve('.sites-runtime/skill-supplier'),chainBase='http://127.0.0.1:8545'}={}){
 if(port!==7461||chainBase!=='http://127.0.0.1:8545')throw new Error('Local supplier uses the fixed loopback development endpoints.');
 await mkdir(runtimeRoot,{recursive:true,mode:0o700});const keyPath=join(runtimeRoot,'signer.json');let privateKey;
 try{privateKey=JSON.parse(await readFile(keyPath,'utf8')).privateKey;if((await stat(keyPath)).mode&0o077)throw new Error('Supplier signing file must have mode 0600.');}catch(e){if(e.code!=='ENOENT')throw e;privateKey=generatePrivateKey();const file=await open(keyPath,'wx',0o600);try{await file.writeFile(JSON.stringify({privateKey}));await file.sync();}finally{await file.close();}}
 const account=privateKeyToAccount(privateKey),base='http://127.0.0.1:'+port,config=parseSupplierConfiguration({url:base+'/v1/execute',id:'local-transfer-supplier',name:'Independent transfer supplier',revision:'1.0.0',signer:account.address,skills:['event-analysis','treasury-report']},true),descriptor=await supplierDescriptor(config);
 const locks=new Map(),attempts=new Map();let mode='healthy',delayMs=2500;
 const pathFor=id=>join(runtimeRoot,id.slice(2)+'.json');
 async function cached(id,request){try{const record=JSON.parse(await readFile(pathFor(id),'utf8'));if(record.requestHash!==await digest(request))throw Object.assign(new Error('conflicting request'),{status:409});return await verifySupplierDelivery(record.delivery,request);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 async function execute(request,fault){
  const input=normalizeInput(request.input);if(await digest(input)!==request.inputHash||canonical(request.supplier)!==canonical(descriptor)||!descriptor.skills.includes(request.skill))throw Object.assign(new Error('request commitment'),{status:409});
  const configResponse=await fetch(chainBase+'/config');if(!configResponse.ok)throw new Error('chain unavailable');const deployment=await configResponse.json();
  if(request.chainId!==deployment.chainId||request.escrow!==deployment.escrow.toLowerCase()||request.seller!==deployment.seller.toLowerCase()||request.identity.registry!==deployment.identityRegistry?.toLowerCase())throw Object.assign(new Error('deployment mismatch'),{status:409});
  const client=createPublicClient({transport:http(chainBase+'/rpc',{retryCount:0,timeout:10000}),cacheTime:0}),chain=new AgentChainClient(client,deployment),evidence=inputEvidence({id:request.orderId,input},request.buyer),[task,block,precision]=await Promise.all([client.readContract({address:deployment.escrow,abi:escrowABI,functionName:'tasks',args:[request.taskId]}),client.getBlock(),chain.validateDeployment()]);
  if(evidence.id!==request.taskId||evidence.datasetHash!==request.spec.datasetHash||task[5]!==1||task[3]<=block.timestamp||task[3]!==BigInt(request.chainDeadline)||task[0].toLowerCase()!==request.buyer||task[1].toLowerCase()!==request.seller||task[2]!==centsToToken(request.quoteCents,precision.decimals)||task[4]!==specHash(request.spec))throw Object.assign(new Error('funded escrow required'),{status:409});
  await chain.verifyEvidence({id:request.taskId,buyer:request.buyer,seller:request.seller,amount:task[2],deadline:task[3],specHash:task[4]},request.fundingTransactionHash,'funding');
  const identityArgs=[BigInt(request.identity.registryAgentId)],identity={address:request.identity.registry,abi:identityABI,args:identityArgs};
  const [owner,wallet,uri,metadata]=await Promise.all([client.readContract({...identity,functionName:'ownerOf'}),client.readContract({...identity,functionName:'getAgentWallet'}),client.readContract({...identity,functionName:'tokenURI'}),client.readContract({address:request.identity.registry,abi:identityABI,functionName:'getMetadata',args:[identityArgs[0],SUPPLIER_METADATA_KEY]})]);
  if(owner.toLowerCase()!==request.identity.owner||wallet.toLowerCase()!==request.seller||keccak256(stringToHex(uri))!==request.identity.documentHash||metadata.toLowerCase()!==supplierMetadata(descriptor).toLowerCase())throw Object.assign(new Error('supplier authorization required'),{status:409});
  if(fault==='slow')await new Promise(resolve=>setTimeout(resolve,delayMs));
  // Separate computation: BigInt accumulation, independent of AgentOS expectedOutput().
  const recipients=new Map();let total=0n,count=0;
  for(const row of input.records??DATASET){if(row.block<input.blockFrom||row.block>input.blockTo)continue;total+=BigInt(row.cents);count++;recipients.set(row.to,(recipients.get(row.to)??0n)+BigInt(row.cents));}
  if(total>BigInt(Number.MAX_SAFE_INTEGER))throw Object.assign(new Error('unsafe total'),{status:400});
  const output={dataset:input.dataset,blockFrom:input.blockFrom,blockTo:input.blockTo,transferCount:count,totalCents:Number(total),...(input.source?{source:sourceSummary(input.source,request.skill)}:{}),...(request.skill==='event-analysis'?{uniqueRecipients:recipients.size}:{allocations:Object.fromEntries([...recipients].map(([key,value])=>[key,Number(value)]))})};
  if(fault==='wrong-result'||request.scenario==='invalid-delivery')output.totalCents++;
  const payload={version:'agentos.skill-delivery.v1',requestHash:await digest(request),configHash:descriptor.configHash,jobId:supplierJobId(request),outputHash:await digest(output),output,issuedAt:new Date().toISOString()},delivery={payload,signature:await account.signMessage({message:supplierReceiptMessage(payload)})};
  await writeAtomic(pathFor(payload.jobId),{requestHash:payload.requestHash,delivery});return delivery;
 }
 const server=createServer(async(req,res)=>{
  const json=(status,value)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  try{
   if(req.headers.host!==new URL(base).host||req.headers.origin)return json(403,{error:'Supplier accepts server-to-server loopback requests only.'});
   const path=new URL(req.url,base).pathname;
   if(req.method==='GET'&&path==='/config')return json(200,config);
   if(req.method==='GET'&&path==='/health')return json(200,{status:'ok',supplier:descriptor.id});
   if(req.method==='GET'&&path==='/stats'){const files=(await readdir(runtimeRoot)).filter(f=>/^[0-9a-f]{64}\.json$/.test(f));return json(200,{jobs:files.length,requests:Object.fromEntries(attempts),mode});}
   if(req.method!=='POST')return json(404,{error:'Route not found.'});
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536)return json(413,{error:'Request too large.'});}const body=JSON.parse(raw);
   if(path==='/testing'){if(!['healthy','outage','lost-response','wrong-result','wrong-signature','slow'].includes(body.mode)||body.delayMs!==undefined&&(!Number.isSafeInteger(body.delayMs)||body.delayMs<100||body.delayMs>10000))return json(400,{error:'Invalid test control.'});mode=body.mode;delayMs=body.delayMs??2500;return json(200,{mode,delayMs});}
   if(path!=='/v1/execute')return json(404,{error:'Route not found.'});
   let request;try{request=supplierRequestSchema.parse(body);}catch{return json(400,{error:'Invalid typed skill request.'});}
   const id=supplierJobId(request);if(req.headers['idempotency-key']!==id)return json(400,{error:'A stable supplier job key is required.'});attempts.set(id,(attempts.get(id)??0)+1);
   const requestHash=await digest(request),existing=await cached(id,request);if(existing)return json(200,existing);
   const fault=mode;if(fault==='outage')return json(503,{error:'Test supplier is offline.'});
   const active=locks.get(id);if(active&&active.requestHash!==requestHash)return json(409,{error:'Job commitment differs.'});
   if(!active){const promise=execute(request,fault);locks.set(id,{requestHash,promise});promise.finally(()=>locks.delete(id)).catch(()=>{});}
   const pending=locks.get(id);let delivery=await pending.promise;
   if(fault==='lost-response'){mode='healthy';return json(503,{error:'Simulated response loss after journal commit.'});}
   if(fault==='wrong-signature')delivery={...delivery,signature:'0x'+'1'.repeat(130)};
   return json(200,delivery);
  }catch(e){return json(e.status===409?409:502,{error:e.status===409?'Supplier request commitment or authority differs.':'Supplier execution could not complete.'});}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});return {base,descriptor,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const service=await startLocalSupplier();console.log('AgentOS independent skill supplier: '+service.base);console.log('Public supplier descriptor: '+JSON.stringify(service.descriptor));let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;await service.close();process.exitCode=0;});
}
