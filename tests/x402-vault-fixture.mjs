import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {decodeEventLog} from 'viem';
import {startX402Stack,freePort} from '../scripts/x402/local-stack.mjs';
import {localServer,readJson,jsonCall} from '../scripts/x402/http.mjs';
import {seed,digest} from '../lib/agentos/engine.ts';
import {createOrder,findOrder} from '../lib/agentos/orders.ts';
import {orderChain} from '../lib/agentos/order-chain.ts';
import {runOrder} from '../lib/agentos/order-runner.ts';
import {inputEvidence} from '../sdk/wallet.ts';
import {identityABI,completeRegistrationDocument,registrationDataURI} from '../sdk/identity.ts';
import {identityDocument,verifyRegistration} from '../lib/agentos/identity.ts';
import {createSupplier,SUPPLIER_METADATA_KEY,supplierMetadata} from '../lib/agentos/supplier.ts';
import {makeSupplierQuoteRequest} from '../lib/agentos/supplier-quote.ts';
import {authorizeSupplier} from '../lib/agentos/supplier-chain.ts';
import {prepareVaultSession,vaultABI,checkVaultBinding} from '../lib/agentos/vault.ts';
import {vaultFunder} from '../lib/agentos/vault-executor.ts';
import {authorizeX402} from '../lib/agentos/x402-authority.ts';
import {x402SupplierHooks} from '../lib/agentos/x402-supplier-runtime.ts';

export async function x402VaultFixture(options={}){
 const root=await mkdtemp(tmpdir()+'/agentos-x402-vault-'),port=await freePort(),origin='http://127.0.0.1:'+port,db=new DatabaseSync(root+'/workspace.sqlite');
 for(const file of readdirSync('drizzle').filter(f=>/^\d+.*\.sql$/.test(f)).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
 const database={prepare(sql){return {bind(...args){return {run:async()=>({meta:db.prepare(sql).run(...args)}),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)})};}};}};
 let writes=Promise.resolve();
 const owner='x402-vault-owner',scope=await digest({workspace:owner}),store={database,read:async id=>{const r=db.prepare('SELECT * FROM agentos_workspaces WHERE owner_id=?').get(id);if(!r)throw Error('Unknown workspace');return {state:JSON.parse(r.data),revision:r.revision,scope:await digest({workspace:id})};}},mutate=reduce=>{const task=writes.then(async()=>{const s=await store.read(owner),next=await reduce(s.state);db.prepare('UPDATE agentos_workspaces SET data=?,revision=revision+1 WHERE owner_id=?').run(JSON.stringify(next),owner);return {...await store.read(owner)};});writes=task.catch(()=>{});return task;};
 db.prepare('INSERT INTO agentos_workspaces VALUES(?,0,?)').run(owner,JSON.stringify(seed()));
 let stack;
 const callback=await localServer(async(req,json,base)=>{const path=new URL(req.url,base).pathname;if(path!=='/api/runtime/x402-authorize'||req.method!=='POST')return json(404,{});try{json(200,await authorizeX402(store,req.headers['x-agentos-x402-ticket']??'',await readJson(req,4096),async o=>{await checkVaultBinding(stack.client,stack.chain.config,o.vault);await authorizeSupplier(stack.client,stack.chain.config,o.agentIdentity,o.supplier);}));}catch(error){json(error.code==='FORBIDDEN'?403:409,{error:error.message});}},port);
 try{
  stack=await startX402Stack({root:root+'/stack',appOrigin:origin,...options});const {client,walletFor,accounts,chain,supplier:remote}=stack,deployment=chain.config,buyer=accounts[0].address,seller=accounts[4].address,contracts=(await import('../scripts/compile-contracts.mjs')).compile();
  const write=async(address,abi,functionName,args=[],account=accounts[0])=>{const hash=await walletFor(account).writeContract({address,abi,functionName,args,gas:6000000n});if((await client.waitForTransactionReceipt({hash})).status!=='success')throw Error('Fixture transaction failed.');return hash;};
  const profile=await identityDocument((await store.read(owner)).state,owner,'sage',origin),registration=await write(deployment.identityRegistry,identityABI,'register',[profile.agentURI],accounts[4]),receipt=await client.getTransactionReceipt({hash:registration}),registered=receipt.logs.map(l=>{try{return decodeEventLog({abi:identityABI,eventName:'Registered',data:l.data,topics:l.topics}).args;}catch{return null;}}).find(Boolean),id=String(registered.agentId),uri=registrationDataURI(completeRegistrationDocument(profile.document,31337,deployment.identityRegistry,id));
  await write(deployment.identityRegistry,identityABI,'setAgentURI',[BigInt(id),uri],accounts[4]);
  const identity=await verifyRegistration((await store.read(owner)).state,owner,'sage',id,registration,origin,client,deployment);
  await write(deployment.identityRegistry,identityABI,'setMetadata',[BigInt(id),SUPPLIER_METADATA_KEY,supplierMetadata(remote.descriptor)],accounts[4]);
  await write(deployment.token,contracts.MockAuthorizationToken.abi,'transfer',[deployment.vault,20000000n]);
  for(const address of [deployment.seller,seller])await write(deployment.vault,vaultABI,'allowSeller',[address,true]);
  await write(deployment.vault,vaultABI,'grant',[deployment.vaultExecutor,1000000n,10000000n,(await client.getBlock()).timestamp+3600n]);
  const session=await prepareVaultSession((await store.read(owner)).state,owner,deployment,client,{buyer,sellers:[seller],perTaskCents:100,totalCents:1000,dailyCents:1000},crypto.randomUUID());session.signature=await accounts[0].signMessage({message:session.message});
  await mutate(s=>({...s,vaultSessions:[session],agentIdentities:[identity]}));
  const configuration=await(await fetch(remote.base+'/config')).json(),authority=async o=>authorizeSupplier(client,deployment,o.agentIdentity,o.supplier),supplier=await createSupplier(configuration,authority,undefined,fetch,x402SupplierHooks(store,configuration,stack.policy,origin,client)),access=orderChain(client,deployment,(path,body)=>jsonCall(chain.base+path,body)),funder=vaultFunder(client,deployment,async order=>(await jsonCall(chain.base+'/vault-fund',{order})).hash),runtime={read:store.read,updateWorkspace:(_owner,reduce)=>mutate(reduce)};
  const input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:1,from:'treasury',to:'alice',cents:125},{block:2,from:'treasury',to:'bob',cents:75}]};
  async function create(extra={}){
   const requestId=crypto.randomUUID(),bytes=inputEvidence({id:'chain-'+requestId,input,skill:'treasury-report'},buyer),spec=await jsonCall(chain.base+'/drafts',bytes),quote=await supplier.quote(await makeSupplierQuoteRequest({requestId,workspaceHash:scope,buyer,payer:deployment.vault,agentId:'sage',skill:'treasury-report',input,identity,deployment,supplier:remote.descriptor})),draft={requestId,title:'x402 Treasury report',agentId:'sage',buyer,budget:100,input,spec,scenario:'success',timeoutSeconds:300,executor:'supplier',supplier:remote.descriptor,supplierQuote:quote,agentIdentity:identity,vaultSessionId:session.sessionId,x402Review:{policyHash:await digest(stack.policy),discloseInput:true},...extra};
   await mutate(s=>createOrder(s,draft,deployment,undefined,{workspaceHash:scope,now:Number(quote.payload.issuedAt)}));return findOrder((await store.read(owner)).state,'chain-'+requestId);
  }
  return {root,db,store,owner,scope,mutate,stack,client,deployment,write,session,identity,supplier,create,run:async id=>runOrder(runtime,owner,id,access,{supplier,supplierAuthority:authority,vaultFunder:funder}),order:async id=>findOrder((await store.read(owner)).state,id),close:async()=>{await callback.close();await stack.close();db.close();await rm(root,{recursive:true,force:true});}};
 }catch(error){await callback.close();if(stack)await stack.close();db.close();await rm(root,{recursive:true,force:true});throw error;}
}
