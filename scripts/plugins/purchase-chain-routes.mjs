import {encodeFunctionData} from 'viem';
import {canonical,resultHash} from '../../cre/workflow/verify.ts';
import {digest} from '../../lib/agentos/engine.ts';
import {pluginPurchaseTerms,pluginPurchaseSpec,selectPluginPurchaseInput} from '../../lib/agentos/plugin-purchase-protocol.ts';
import {pluginManifestHash,validatePluginValue} from '../../lib/agentos/plugin-protocol.ts';
import {sessionBinding,checkVaultBinding,vaultABI} from '../../lib/agentos/vault.ts';
import {AgentChainClient,centsToToken,escrowABI,encodeSettlementReport} from '../../sdk/chain.ts';
import {verifyPluginForSettlement} from './settlement-verifier.mjs';
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();

/** Local EVM acceptance authority. It has no public-chain signer or DON claim. */
export function pluginPurchaseRoutes({client,wallet,config,metadata,buyer,executor,forwarder}){
 const records=new Map(),funds=new Map(),settlements=new Map(),chain=new AgentChainClient(client,config);
 const task=id=>client.readContract({address:config.escrow,abi:escrowABI,functionName:'tasks',args:[id]});
 async function evidence(intent,phase){const event=phase==='funding'?'Opened':'Settled',logs=await client.getContractEvents({address:config.escrow,abi:escrowABI,eventName:event,args:{id:intent.id},fromBlock:BigInt(config.deployedBlock)});if(logs.length!==1)throw Error('Plugin purchase canonical event is unavailable.');return chain.verifyEvidence(intent,logs[0].transactionHash,phase);}
 async function prepare(body){
  const {flow,index,manifest,session}=body,step=flow?.steps?.[index];
  if(!flow||flow.version!=='agentos.plugin-purchase.v1'||!Array.isArray(flow.steps)||flow.steps.length<1||flow.steps.length>8||!step||step.index!==index||flow.termsHash!==await digest(pluginPurchaseTerms(flow))||!step.fundingIntent||!step.inputHash||step.inputValue===undefined||!same(flow.buyer,buyer)||flow.steps.some(s=>!Number.isSafeInteger(s.priceCents)||s.priceCents<1)||flow.steps.reduce((n,s)=>n+s.priceCents,0)>flow.totalBudget)throw Error('Invalid immutable plugin purchase intent.');
  const {configHash,...runtimeTerms}=flow.runtime;if(configHash!==step.runtimeHash||await digest(runtimeTerms)!==configHash||!/^0x[0-9a-fA-F]{40}$/.test(flow.runtime.deliverySigner??''))throw Error('The funded plugin runtime differs from its signed commitment.');
  for(const key of ['chainId','token','escrow','forwarder','metadataHash','seller','vault','vaultExecutor'])if(!same(flow.deployment[key],config[key]))throw Error('Plugin purchase deployment differs.');
  if(!session?.signature||session.sessionId!==flow.vaultSessionId||session.scope!==flow.scope||!same(session.owner,flow.buyer)||canonical(sessionBinding(session))!==canonical(flow.vault)||!session.message.includes('Grant: '+canonical(flow.vault))||!await client.verifyMessage({address:flow.buyer,message:session.message,signature:session.signature}))throw Error('Plugin purchase owner authorization differs.');
  const permission=session.pluginPermissions?.find(p=>p.pluginId===step.pluginId&&p.manifestHash===step.manifestHash&&p.runtimeHash===step.runtimeHash&&p.maxPriceCents>=step.priceCents);
  if(!permission||await pluginManifestHash(manifest)!==step.manifestHash||await digest(step.inputValue)!==step.inputHash||await digest(pluginPurchaseSpec(flow,step))!==step.specHash)throw Error('Plugin input, price or code differs from the approved intent.');
  validatePluginValue(manifest.input,step.inputValue);
  const paid=new Map();if(step.input.from==='root'&&flow.acceptedRoot){
   const root=flow.acceptedRoot,record=records.get(root.taskId),view=await task(root.taskId);
   if(!record?.acceptedExecution||record.workflowId!==root.workflowId||record.scope!==flow.scope||!same(record.buyer,flow.buyer)||root.executionDigest!==record.acceptedExecution.digest||view[5]!==2||view[6]!==resultHash(record.acceptedExecution)||canonical(flow.input)!==canonical(record.acceptedExecution.output)||canonical(step.parent)!==canonical({workflowId:root.workflowId,step:root.step,taskId:root.taskId,transactionHash:root.settlementTransactionHash,executionDigest:root.executionDigest}))throw Error('Repair input has no independently accepted paid parent.');
   const proof=await evidence(record.intent,'settlement');if(proof.status!=='paid'||proof.transactionHash!==root.settlementTransactionHash)throw Error('Repair parent payment is not canonical.');
  }if(step.input.from==='step'){
   const parent=flow.steps[step.input.step],record=records.get(parent.taskId),view=await task(parent.taskId);
   if(!step.parent||step.parent.step!==parent.index||step.parent.taskId!==parent.taskId||!record?.acceptedExecution||view[5]!==2||view[6]!==resultHash(record.acceptedExecution)||step.parent.executionDigest!==record.acceptedExecution.digest)throw Error('Plugin input has no independently accepted paid parent.');
   const proof=await evidence(record.intent,'settlement');if(proof.status!=='paid'||proof.transactionHash!==step.parent.transactionHash)throw Error('Plugin parent payment is not canonical.');paid.set(parent.index,record.acceptedExecution.output);
  }
  if(canonical(selectPluginPurchaseInput(flow.input,step.input,paid))!==canonical(step.inputValue))throw Error('Plugin input differs from its committed paid dependency.');
  const {decimals}=await chain.validateDeployment(),intent={id:step.taskId,buyer:flow.vault.vault,seller:config.seller,amount:centsToToken(step.priceCents,decimals),deadline:BigInt(step.fundingIntent.deadline),specHash:step.specHash},request={jobId:step.jobId,scope:flow.scope,manifest,manifestHash:step.manifestHash,input:step.inputValue,inputHash:step.inputHash,runtimeHash:step.runtimeHash};
  const prior=records.get(intent.id);if(prior&&(canonical(prior.request)!==canonical(request)||canonical({...prior.intent,amount:String(prior.intent.amount),deadline:String(prior.intent.deadline)})!==canonical({...intent,amount:String(intent.amount),deadline:String(intent.deadline)})))throw Error('Plugin escrow intent is immutable.');
  if(!prior)records.set(intent.id,{workflowId:flow.id,buyer:flow.buyer,intent,request,runtime:flow.runtime,sessionId:session.sessionId,scope:flow.scope,priceCents:step.priceCents});return {record:records.get(intent.id),session};
 }
 async function handle(path,body){
  if(path==='/plugin-purchase/fund'){
   const {record,session}=await prepare(body),id=record.intent.id;
   if(!funds.has(id)){const action=(async()=>{const existing=await task(id);if(existing[5]!==0){record.funding=await evidence(record.intent,'funding');return {hash:record.funding.transactionHash};}
    const view=await checkVaultBinding(client,config,session),used=Array.from(records.values()).filter(r=>r.sessionId===record.sessionId&&r.scope===record.scope&&r.funding).reduce((n,r)=>n+r.priceCents,0);
    if(used+record.priceCents>session.totalCents||record.priceCents>session.perTaskCents||record.intent.deadline<=view.now||record.intent.deadline>view.now+86400n||view.balance<record.intent.amount||view.spent+record.intent.amount>view.grant[1])throw Error('Plugin Vault limits do not permit funding.');
    const data=encodeFunctionData({abi:vaultABI,functionName:'execute',args:[id,record.intent.seller,record.intent.amount,record.intent.deadline,record.intent.specHash]}),hash=await wallet.sendTransaction({account:executor,to:config.vault,data,gas:6000000n}),receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw Error('Plugin Vault funding reverted.');record.funding=await chain.verifyEvidence(record.intent,hash,'funding');return {hash};})();funds.set(id,action);action.catch(()=>funds.delete(id));}
   return await funds.get(id);
  }
  if(path==='/plugin-purchase/settle'){
   const record=records.get(body.id);if(!record)throw Error('Plugin funding intent is unavailable.');
   if(!settlements.has(body.id)){const action=(async()=>{const view=await task(body.id);if(view[5]===2||view[5]===3)return {hash:(await evidence(record.intent,'settlement')).transactionHash,mode:'local independent plugin verifier; no DON'};if(view[5]!==1)throw Error('Plugin escrow is not funded.');
    if((await client.getBlock()).timestamp>=record.intent.deadline){const hash=await wallet.writeContract({address:config.escrow,abi:escrowABI,functionName:'refundExpired',args:[body.id],account:buyer,gas:6000000n});await client.waitForTransactionReceipt({hash});return {hash,mode:'local expired plugin escrow refund'};}
    let accepted=false,outputHash=resultHash({version:'agentos.plugin-rejection.v1',taskId:body.id});
    if(body.mode==='verify'&&body.execution){try{await verifyPluginForSettlement(record.request,body.execution,record.runtime);accepted=true;outputHash=resultHash(body.execution);}catch{accepted=false;}}
    const hash=await wallet.writeContract({address:config.escrow,abi:[{type:'function',name:'onReport',stateMutability:'nonpayable',inputs:[{name:'metadata',type:'bytes'},{name:'report',type:'bytes'}],outputs:[]}],functionName:'onReport',args:[metadata,encodeSettlementReport(body.id,record.intent.specHash,outputHash,accepted)],account:forwarder,gas:6000000n}),receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw Error('Plugin settlement reverted.');if(accepted)record.acceptedExecution=structuredClone(body.execution);return {hash,accepted,mode:'local independent plugin verifier; no DON'};
   })();settlements.set(body.id,action);action.catch(()=>settlements.delete(body.id));}
   return await settlements.get(body.id);
  }
 }
 return {handle};
}
