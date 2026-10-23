import {supplierQuoteRequestSchema,supplierQuoteRequestKey,supplierQuoteMessage,verifySupplierQuote} from '../lib/agentos/supplier-quote.ts';
import {execute as executeExtension} from '../examples/skills/ranked-flows-provider.mjs';
import {vaultABI} from '../lib/agentos/vault.ts';
import {sourceSummary} from '../lib/agentos/transfer-source.ts';
import { createServer } from 'node:http';
import { mkdir,open,readFile,readdir,rename,stat } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient,http,keccak256,stringToHex } from 'viem';
import { generatePrivateKey,privateKeyToAccount } from 'viem/accounts';
import { canonical,specHash,deliveryVerification,resultHash } from '../cre/workflow/verify.ts';
import { AgentChainClient,centsToToken,escrowABI } from '../sdk/chain.ts';
import { inputEvidence } from '../sdk/wallet.ts';
import { identityABI } from '../sdk/identity.ts';
import { DATASET,digest,normalizeInput } from '../lib/agentos/engine.ts';
import { parseSupplierConfiguration,supplierDescriptor,supplierRequestSchema,supplierJobId,supplierReceiptMessage,supplierMetadata,SUPPLIER_METADATA_KEY,verifySupplierDelivery } from '../lib/agentos/supplier.ts';

const bundledSkill=JSON.parse(await readFile(new URL('../examples/skills/treasury-concentration.json',import.meta.url),'utf8'));
async function writeAtomic(path,value){const temporary=path+'.'+crypto.randomUUID()+'.tmp',file=await open(temporary,'wx',0o600);try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}await rename(temporary,path);}
export async function startLocalSupplier({port=7461,runtimeRoot=resolve('.sites-runtime/skill-supplier'),chainBase='http://127.0.0.1:8545',skills=['event-analysis','treasury-report',bundledSkill.id],supplierId='local-transfer-supplier',supplierName='Independent transfer supplier',walletRole='seller',peers=[],prices={},quoteTTL=21600,fulfillment}={}){
 if(!['seller','seller2'].includes(walletRole)||!Array.isArray(peers)||peers.length>7)throw new Error('Invalid bounded local supplier configuration.');
 const peerConfigurations=await Promise.all(peers.map(async peer=>{const u=new URL(peer);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.pathname!=='/'||u.username||u.password||u.search||u.hash)throw new Error('Local catalog peers require plain loopback endpoints.');const r=await fetch(u.origin+'/config',{redirect:'error',signal:AbortSignal.timeout(3000)});if(!r.ok)throw new Error('Local catalog peer unavailable.');return parseSupplierConfiguration(await r.json(),true);}));
 if(!prices||typeof prices!=='object'||Array.isArray(prices)||Object.entries(prices).some(([skill,price])=>!skills.includes(skill)||!Number.isSafeInteger(price)||price<1||price>1000000)||!Number.isSafeInteger(quoteTTL)||quoteTTL<60||quoteTTL>86400)throw new Error('Invalid supplier pricing configuration.');
 const pricing=Object.fromEntries(skills.map(skill=>[skill,prices[skill]??(skill==='event-analysis'?(walletRole==='seller2'?200:240):360)]));
 const chainURL=new URL(chainBase);if(!Number.isInteger(port)||port<1||port>65535||chainURL.protocol!=='http:'||chainURL.hostname!=='127.0.0.1'||chainURL.pathname!=='/'||chainURL.username||chainURL.password||chainURL.search||chainURL.hash)throw new Error('Local supplier requires configured loopback endpoints.');
 await mkdir(runtimeRoot,{recursive:true,mode:0o700});const keyPath=join(runtimeRoot,'signer.json');let privateKey;
 try{privateKey=JSON.parse(await readFile(keyPath,'utf8')).privateKey;if((await stat(keyPath)).mode&0o077)throw new Error('Supplier signing file must have mode 0600.');}catch(e){if(e.code!=='ENOENT')throw e;privateKey=generatePrivateKey();const file=await open(keyPath,'wx',0o600);try{await file.writeFile(JSON.stringify({privateKey}));await file.sync();}finally{await file.close();}}
 const account=privateKeyToAccount(privateKey),base='http://127.0.0.1:'+port,config=parseSupplierConfiguration({url:base+'/v1/execute',id:supplierId,name:supplierName,revision:fulfillment?.revision??'1.0.0',signer:account.address,skills},true),descriptor=await supplierDescriptor(config);
 const locks=new Map(),attempts=new Map(),quoteAttempts=new Map();let mode='healthy',delayMs=2500;
 const pathFor=id=>join(runtimeRoot,id.slice(2)+'.json');
 async function cached(id,request){try{const record=JSON.parse(await readFile(pathFor(id),'utf8'));if(record.requestHash!==await digest(request))throw Object.assign(new Error('conflicting request'),{status:409});return await verifySupplierDelivery(record.delivery,request);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 async function quote(request){
  if(request.supplierId!==descriptor.id||request.configHash!==descriptor.configHash||!descriptor.skills.includes(request.skill))throw Object.assign(new Error('quote configuration'),{status:409});
  const deployment=await(await fetch(chainBase+'/config')).json(),client=createPublicClient({transport:http(chainBase+'/rpc',{retryCount:0,timeout:10000}),cacheTime:0}),actor=(await(await fetch(chainBase+(walletRole==='seller'?'/seller-rpc':'/seller2-rpc'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'quote-wallet',method:'eth_accounts',params:[]})})).json()).result?.[0];
  if(!actor||request.chainId!==deployment.chainId||request.escrow!==deployment.escrow.toLowerCase()||request.token!==deployment.token.toLowerCase()||request.registry!==deployment.identityRegistry?.toLowerCase()||request.seller!==actor.toLowerCase())throw Object.assign(new Error('quote deployment'),{status:409});
  const args=[BigInt(request.registryAgentId)],baseIdentity={address:request.registry,abi:identityABI,args},[owner,wallet,uri,metadata,block]=await Promise.all([client.readContract({...baseIdentity,functionName:'ownerOf'}),client.readContract({...baseIdentity,functionName:'getAgentWallet'}),client.readContract({...baseIdentity,functionName:'tokenURI'}),client.readContract({address:request.registry,abi:identityABI,functionName:'getMetadata',args:[args[0],SUPPLIER_METADATA_KEY]}),client.getBlock()]);
  if(owner.toLowerCase()!==request.identityOwner||wallet.toLowerCase()!==request.seller||keccak256(stringToHex(uri))!==request.documentHash||metadata.toLowerCase()!==supplierMetadata(descriptor).toLowerCase())throw Object.assign(new Error('quote authority'),{status:409});
  if(request.payer!==request.buyer&&(!deployment.vault||request.payer!==deployment.vault.toLowerCase()||(await client.readContract({address:deployment.vault,abi:vaultABI,functionName:'owner'})).toLowerCase()!==request.buyer))throw Object.assign(new Error('quote payer'),{status:409});
  const priceSnapshot=await fulfillment?.quoteSnapshot?.();
  const key=supplierQuoteRequestKey(request),path=join(runtimeRoot,key+'.json'),now=Number(block.timestamp);
  try{return await verifySupplierQuote(JSON.parse(await readFile(path,'utf8')),request,descriptor,now);}catch(error){if(error.code!=='ENOENT')throw error;}
  const payload={version:'agentos.skill-quote.v1',request,priceCents:pricing[request.skill],...(priceSnapshot?{priceSnapshot}:{}),issuedAt:now,expiresAt:now+(mode==='short-quote'?30:quoteTTL)},offer={payload,signature:await account.signMessage({message:supplierQuoteMessage(payload)})};await writeAtomic(path,offer);return offer;
 }
 async function execute(request,fault,ticket){
  const input=normalizeInput(request.input);if(await digest(input)!==request.inputHash||canonical(request.supplier)!==canonical(descriptor)||!descriptor.skills.includes(request.skill))throw Object.assign(new Error('request commitment'),{status:409});
  const configResponse=await fetch(chainBase+'/config');if(!configResponse.ok)throw new Error('chain unavailable');const deployment=await configResponse.json();
  const actorResponse=await fetch(chainBase+(walletRole==='seller'?'/seller-rpc':'/seller2-rpc'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'supplier-wallet',method:'eth_accounts',params:[]})}),actor=(await actorResponse.json()).result?.[0];
  if(!actor||request.chainId!==deployment.chainId||request.escrow!==deployment.escrow.toLowerCase()||request.seller!==actor.toLowerCase()||request.identity.registry!==deployment.identityRegistry?.toLowerCase())throw Object.assign(new Error('deployment mismatch'),{status:409});
  const client=createPublicClient({transport:http(chainBase+'/rpc',{retryCount:0,timeout:10000}),cacheTime:0}),chain=new AgentChainClient(client,deployment),evidence=inputEvidence({id:request.orderId,input},request.buyer),[task,block,precision]=await Promise.all([client.readContract({address:deployment.escrow,abi:escrowABI,functionName:'tasks',args:[request.taskId]}),client.getBlock(),chain.validateDeployment()]);
  if(request.paymentBuyer&&(!deployment.vault||request.paymentBuyer!==deployment.vault.toLowerCase()||(await client.readContract({address:deployment.vault,abi:vaultABI,functionName:'owner'})).toLowerCase()!==request.buyer))throw Object.assign(new Error('vault owner mismatch'),{status:409});
  if(evidence.id!==request.taskId||evidence.datasetHash!==request.spec.datasetHash||task[5]!==1||task[3]<=block.timestamp||task[3]!==BigInt(request.chainDeadline)||task[0].toLowerCase()!==(request.paymentBuyer??request.buyer)||task[1].toLowerCase()!==request.seller||task[2]!==centsToToken(request.quoteCents,precision.decimals)||task[4]!==specHash(request.spec))throw Object.assign(new Error('funded escrow required'),{status:409});
  const funding=await chain.verifyEvidence({id:request.taskId,buyer:request.paymentBuyer??request.buyer,seller:request.seller,amount:task[2],deadline:task[3],specHash:task[4]},request.fundingTransactionHash,'funding');
  if(request.quote){const expected={...request.quote.payload.request,requestId:request.orderId.slice(6),buyer:request.buyer,payer:request.paymentBuyer??request.buyer,chainId:request.chainId,escrow:request.escrow,token:deployment.token.toLowerCase(),skill:request.skill,inputHash:request.inputHash,verificationHash:resultHash(request.spec.verification),registry:request.identity.registry,registryAgentId:request.identity.registryAgentId,identityOwner:request.identity.owner,seller:request.seller,documentHash:request.identity.documentHash,supplierId:descriptor.id,configHash:descriptor.configHash};const offer=await verifySupplierQuote(request.quote,expected,descriptor,Number((await client.getBlock({blockNumber:BigInt(funding.blockNumber)})).timestamp));if(offer.payload.priceCents!==request.quoteCents)throw Object.assign(new Error('quote price'),{status:409});}
  const identityArgs=[BigInt(request.identity.registryAgentId)],identity={address:request.identity.registry,abi:identityABI,args:identityArgs};
  const [owner,wallet,uri,metadata]=await Promise.all([client.readContract({...identity,functionName:'ownerOf'}),client.readContract({...identity,functionName:'getAgentWallet'}),client.readContract({...identity,functionName:'tokenURI'}),client.readContract({address:request.identity.registry,abi:identityABI,functionName:'getMetadata',args:[identityArgs[0],SUPPLIER_METADATA_KEY]})]);
  if(owner.toLowerCase()!==request.identity.owner||wallet.toLowerCase()!==request.seller||keccak256(stringToHex(uri))!==request.identity.documentHash||metadata.toLowerCase()!==supplierMetadata(descriptor).toLowerCase())throw Object.assign(new Error('supplier authorization required'),{status:409});
  if(input.skillDefinition&&(input.skillDefinition.id!==request.skill||canonical(deliveryVerification(request.skill,input))!==canonical(request.spec.verification)))throw Object.assign(new Error('skill definition commitment'),{status:409});
  if(fault==='slow')await new Promise(resolve=>setTimeout(resolve,delayMs));
  let output;
  if(fulfillment){output=await fulfillment.execute(request,ticket,descriptor,account);}
  else{
  // Separate computation: BigInt accumulation, independent of AgentOS expectedOutput().
  const recipients=new Map();let total=0n,count=0;
  for(const row of input.records??DATASET){if(row.block<input.blockFrom||row.block>input.blockTo)continue;total+=BigInt(row.cents);count++;recipients.set(row.to,(recipients.get(row.to)??0n)+BigInt(row.cents));}
  if(total>BigInt(Number.MAX_SAFE_INTEGER))throw Object.assign(new Error('unsafe total'),{status:400});
  output=input.skillDefinition?{...executeExtension(input.skillDefinition,{dataset:input.dataset,blockFrom:input.blockFrom,blockTo:input.blockTo,records:input.records??DATASET}),...(input.source?{source:sourceSummary(input.source,request.skill)}:{})}:{dataset:input.dataset,blockFrom:input.blockFrom,blockTo:input.blockTo,transferCount:count,totalCents:Number(total),...(input.source?{source:sourceSummary(input.source,request.skill)}:{}),...(request.skill==='event-analysis'?{uniqueRecipients:recipients.size}:{allocations:Object.fromEntries([...recipients].map(([key,value])=>[key,Number(value)]))})};
  }
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
      if(req.method==='GET'&&path==='/v1/x402-policy'&&fulfillment)return json(200,fulfillment.policy);
   if(req.method==='GET'&&path==='/v1/data-feeds'&&fulfillment?.feedStatus)return json(200,await fulfillment.feedStatus());
   if(req.method==='GET'&&path==='/catalog')return json(200,[config,...peerConfigurations]);
   if(req.method==='GET'&&path==='/health')return json(200,{status:'ok',supplier:descriptor.id});
   if(req.method==='GET'&&path==='/stats'){const files=(await readdir(runtimeRoot)).filter(f=>/^[0-9a-f]{64}\.json$/.test(f));return json(200,{jobs:files.length,quotes:(await readdir(runtimeRoot)).filter(f=>/^quote-0x[0-9a-f]{64}\.json$/.test(f)).length,quoteRequests:Object.fromEntries(quoteAttempts),requests:Object.fromEntries(attempts),mode});}
   if(req.method!=='POST')return json(404,{error:'Route not found.'});
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536)return json(413,{error:'Request too large.'});}const body=JSON.parse(raw);
   if(path==='/testing'){if(!['healthy','outage','lost-response','wrong-result','wrong-signature','slow','quote-lost-response','short-quote'].includes(body.mode)||body.delayMs!==undefined&&(!Number.isSafeInteger(body.delayMs)||body.delayMs<100||body.delayMs>10000))return json(400,{error:'Invalid test control.'});mode=body.mode;delayMs=body.delayMs??2500;return json(200,{mode,delayMs});}
   if(path==='/v1/quote'){
    let request;try{request=supplierQuoteRequestSchema.parse(body);}catch{return json(400,{error:'Invalid quote request.'});}
    const key=supplierQuoteRequestKey(request);quoteAttempts.set(key,(quoteAttempts.get(key)??0)+1);if(req.headers['idempotency-key']!==key)return json(400,{error:'A stable quote key is required.'});
    if(!locks.has(key)){const promise=quote(request);locks.set(key,{promise});promise.finally(()=>locks.delete(key)).catch(()=>{});}
    const offer=await locks.get(key).promise;if(mode==='quote-lost-response'){mode='healthy';return json(503,{error:'Simulated response loss after quote commit.'});}return json(200,offer);
   }
   if(path==='/v1/x402-evidence'&&fulfillment){return json(200,await fulfillment.evidence(body,req.headers['x-agentos-x402-ticket'],descriptor,account));}
   if(path!=='/v1/execute')return json(404,{error:'Route not found.'});
   let request;try{request=supplierRequestSchema.parse(body);}catch{return json(400,{error:'Invalid typed skill request.'});}
   const id=supplierJobId(request);if(req.headers['idempotency-key']!==id)return json(400,{error:'A stable supplier job key is required.'});attempts.set(id,(attempts.get(id)??0)+1);
   if(fulfillment)await fulfillment.observe(request,req.headers['x-agentos-x402-ticket']);
   const requestHash=await digest(request),existing=await cached(id,request);if(existing)return json(200,existing);
   const fault=mode;if(fault==='outage')return json(503,{error:'Test supplier is offline.'});
   const active=locks.get(id);if(active&&active.requestHash!==requestHash)return json(409,{error:'Job commitment differs.'});
   if(!active){const promise=execute(request,fault,req.headers['x-agentos-x402-ticket']);locks.set(id,{requestHash,promise});promise.finally(()=>locks.delete(id)).catch(()=>{});}
   const pending=locks.get(id);let delivery=await pending.promise;
   if(fault==='lost-response'){mode='healthy';return json(503,{error:'Simulated response loss after journal commit.'});}
   if(fault==='wrong-signature')delivery={...delivery,signature:'0x'+'1'.repeat(130)};
   return json(200,delivery);
  }catch(e){return json([403,409,422].includes(e.status)?e.status:e.terminal?422:502,{error:e.status===409?'Supplier request commitment or authority differs.':'Supplier execution could not complete.'});}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});return {base,descriptor,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const service=await startLocalSupplier({port:Number(process.env.AGENTOS_SUPPLIER_PORT||7461),skills:process.env.AGENTOS_SUPPLIER_SKILLS?JSON.parse(process.env.AGENTOS_SUPPLIER_SKILLS):undefined,chainBase:process.env.AGENTOS_CHAIN_URL||'http://127.0.0.1:8545',runtimeRoot:process.env.AGENTOS_SUPPLIER_STATE||resolve('.sites-runtime/skill-supplier'),supplierId:process.env.AGENTOS_SUPPLIER_ID,supplierName:process.env.AGENTOS_SUPPLIER_NAME,walletRole:process.env.AGENTOS_SUPPLIER_WALLET_ROLE||'seller',peers:process.env.AGENTOS_SUPPLIER_PEERS?JSON.parse(process.env.AGENTOS_SUPPLIER_PEERS):[],prices:process.env.AGENTOS_SUPPLIER_PRICES?JSON.parse(process.env.AGENTOS_SUPPLIER_PRICES):{},quoteTTL:Number(process.env.AGENTOS_SUPPLIER_QUOTE_TTL||21600)});console.log('AgentOS independent skill supplier: '+service.base);console.log('Public supplier descriptor: '+JSON.stringify(service.descriptor));let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;await service.close();process.exitCode=0;});
}
