import {readLocalState,writeLocalState,localMap} from './local-state.mjs';
import {pluginPurchaseRoutes} from './plugins/purchase-chain-routes.mjs';
import {inputEvidence} from '../sdk/wallet.ts';
import {vaultFunder} from '../lib/agentos/vault-executor.ts';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import ganache from 'ganache';
import { createPublicClient, createWalletClient, custom, keccak256, parseAbi, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { compile } from './compile-contracts.mjs';
import { normalizeInput } from '../lib/agentos/engine.ts';
import { encodeSettlementReport, escrowABI } from '../sdk/chain.ts';
import { specHash, verifyDelivery, validateVerification } from '../cre/workflow/verify.ts';
import { deployIdentityRegistries } from './compile-identity.mjs';

const rpcMethods=new Set(['personal_sign','eth_chainId','eth_accounts','eth_blockNumber','eth_call','eth_getBalance','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getBlockByNumber','eth_getBlockByHash','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory','eth_getTransactionCount','eth_sendTransaction','web3_clientVersion','net_version','eth_getCode','eth_getLogs']);
export async function startLocalChain({port=8545,appOrigin='http://127.0.0.1:5177',identity=true,stateDirectory}={}){
  const origin=new URL(appOrigin);if(!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw new Error('Local chain requires a loopback app origin.');
  const statePath=stateDirectory?stateDirectory+'/deployment.bin':undefined;let saved=readLocalState(statePath,null);const fresh=!saved;if(!saved){saved={seed:crypto.randomUUID(),appOrigin:origin.origin,identity};writeLocalState(statePath,saved);}if(saved.appOrigin!==origin.origin||saved.identity!==identity)throw Error('Persistent local chain origin or identity configuration changed.');
  const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',chainId:31337},...(stateDirectory?{wallet:{seed:saved.seed},database:{dbPath:stateDirectory+'/evm'}}:{})});
  const client=createPublicClient({transport:custom(provider),cacheTime:0}),wallet=createWalletClient({transport:custom(provider),chain:null});
  const [buyer,seller,forwarder,executor,seller2]=await wallet.getAddresses();let config;const metadata=stringToHex('agentos-local-verifier:v1');
  if(!fresh&&!saved.config){await provider.disconnect();throw Error('Incomplete local deployment journal; preserve it and create a separate instance.');}
  if(saved.config){config=saved.config;if(saved.buyer!==buyer){await provider.disconnect();throw Error('Persistent local wallet differs.');}for(const address of [config.token,config.escrow,config.vault,config.identityRegistry,config.reputationRegistry].filter(Boolean))if((await client.getCode({address}))==='0x'||!await client.getCode({address})){await provider.disconnect();throw Error('Persistent deployment is missing contract code.');}}else{const artifacts=compile();
  async function deploy(name,args=[]){const hash=await wallet.deployContract({...artifacts[name],account:buyer,args,gas:6000000n});return(await client.waitForTransactionReceipt({hash})).contractAddress;}
  const token=await deploy('MockToken'),metadataHash=keccak256(metadata),escrow=await deploy('AgentEscrow',[token,forwarder,metadataHash]);
  await client.waitForTransactionReceipt({hash:await wallet.writeContract({address:token,abi:artifacts.MockToken.abi,functionName:'mint',args:[buyer,100000000n],account:buyer,gas:6000000n})});
  const vault=await deploy('AgentVault',[escrow]);
  const registries=identity?await deployIdentityRegistries(client,wallet,buyer):{};
  config={mode:'local',chainId:31337,token,escrow,forwarder,metadataHash,confirmations:1,seller,vault,vaultExecutor:executor,deployedBlock:'0',...registries};writeLocalState(statePath,{...saved,buyer,config});}
  const {token,escrow,vault,metadataHash}=config,registries={identityRegistry:config.identityRegistry,reputationRegistry:config.reputationRegistry},deliveryJournal=localMap(stateDirectory?stateDirectory+'/deliveries.bin':undefined),deliveries=deliveryJournal.map,settlements=new Map();
  const pluginRoutes=pluginPurchaseRoutes({client,wallet,config,metadata,buyer,executor,forwarder,stateDirectory});
  let base;
  const server=createServer(async(req,res)=>{
    const json=(status,data)=>{if(req.method==='POST')deliveryJournal.flush();res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
    try{
      if(req.headers.host!==new URL(base).host||req.headers.origin&&req.headers.origin!==origin.origin)return json(403,{error:'Local chain origin rejected.'});
      if(req.headers.origin)res.setHeader('Access-Control-Allow-Origin',origin.origin);
      if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});res.end();return;}
      const path=new URL(req.url,base).pathname;
      if(req.method==='GET'&&path==='/config')return json(200,config);
      const specMatch=path.match(/^\/spec\/(0x[0-9a-f]{64})$/);
      if(req.method==='GET'&&specMatch){const record=deliveries.get(specMatch[1]);return record?json(200,record.spec):json(404,{error:'Delivery not found.'});}
      const match=path.match(/^\/(dataset|artifact)\/(0x[0-9a-f]{64})$/);
      if(req.method==='GET'&&match){const record=deliveries.get(match[2]);if(!record||match[1]==='artifact'&&!record.artifactText)return json(404,{error:'Delivery not ready.'});res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(match[1]==='dataset'?record.datasetText:record.artifactText);return;}
      if(req.method!=='POST')return json(404,{error:'Route not found.'});
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>(path.startsWith('/plugin-purchase/')?524288:65536))throw new Error('Local request too large.');}const body=JSON.parse(raw);
      if(path.startsWith('/plugin-purchase/')){if(req.headers.origin)throw new Error('Plugin purchase execution is server-to-server only.');const result=await pluginRoutes.handle(path,body);return result?json(200,result):json(404,{error:'Plugin purchase route not found.'});}
      if(path==='/rpc'||path==='/seller-rpc'||path==='/seller2-rpc'){
        const {id,method,params=[]}=body;
        const actor=path==='/rpc'?buyer:path==='/seller-rpc'?seller:seller2;
        if(!rpcMethods.has(method))return json(200,{jsonrpc:'2.0',id,error:{code:-32601,message:'Method is not enabled in the local test wallet.'}});
        if(method==='eth_accounts')return json(200,{jsonrpc:'2.0',id,result:[actor]});
        if(method==='personal_sign'){
          const prefix=actor!==buyer?'AgentOS identity binding v1\n':'AgentOS chain reconciliation v1\n';
          if(params[1]?.toLowerCase()!==actor.toLowerCase()||typeof params[0]!=='string'||!/^0x[0-9a-fA-F]+$/.test(params[0])||params[0].length>32770||!Buffer.from(params[0].slice(2),'hex').toString().startsWith(prefix))return json(200,{jsonrpc:'2.0',id,error:{code:-32602,message:'Local wallet only signs its AgentOS scoped challenge.'}});
          const account=privateKeyToAccount(provider.getInitialAccounts()[actor.toLowerCase()].secretKey);
          return json(200,{jsonrpc:'2.0',id,result:await account.signMessage({message:{raw:params[0]}})});
        }
        const targets=(actor!==buyer?[registries.identityRegistry]:[token,escrow,vault,registries.reputationRegistry]).filter(address=>typeof address==='string');
        if(method==='eth_sendTransaction'&&(params[0]?.from?.toLowerCase()!==actor.toLowerCase()||!targets.some(address=>address.toLowerCase()===params[0]?.to?.toLowerCase())))return json(200,{jsonrpc:'2.0',id,error:{code:-32602,message:'Local wallet only signs its role-specific test contracts.'}});
        try{return json(200,{jsonrpc:'2.0',id,result:await provider.request({method,params})});}catch(error){return json(200,{jsonrpc:'2.0',id,error:{code:error.code??-32000,message:error.message}});}
      }
      if(path==='/vault-fund'){
        if(req.headers.origin)throw new Error('Vault executor is server-to-server only.');
        const order=body.order,record=order&&deliveries.get(inputEvidence(order,order.buyer).id);
        if(!record?.locked||specHash(record.spec)!==specHash(order.spec))throw new Error('A committed local order is required.');
        const fund=vaultFunder(client,config,async(_order,data)=>{const hash=await wallet.sendTransaction({account:executor,to:vault,data,gas:6000000n});const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw new Error('Vault execute reverted.');return hash;});
        return json(200,{hash:await fund(order)});
      }
      if(path==='/drafts'){
        if(!/^0x[0-9a-f]{64}$/.test(body.id)||typeof body.datasetText!=='string')throw new Error('Invalid local input commitment.');
        const decoded=JSON.parse(body.datasetText),records=Array.isArray(decoded)?decoded:decoded.records;if(!Array.isArray(records))throw new Error('Invalid input.');if(records.length)normalizeInput({dataset:'custom-transfers-v1',blockFrom:decoded.source||decoded.memory?body.verification.blockFrom:0,blockTo:decoded.source||decoded.memory?body.verification.blockTo:Number.MAX_SAFE_INTEGER,records,...(decoded.source?{source:decoded.source}:{}),...(decoded.memory?{memory:decoded.memory}:{})});
        validateVerification(body.verification);
        const existing=deliveries.get(body.id);if(existing&&(existing.datasetText!==body.datasetText||JSON.stringify(existing.spec.verification)!==JSON.stringify(body.verification)))throw new Error('This input commitment already exists.');
        const spec={datasetUrl:base+'/dataset/'+body.id,datasetHash:keccak256(stringToHex(body.datasetText)),artifactUrl:base+'/artifact/'+body.id,verification:body.verification};
        if(!existing){deliveries.set(body.id,{datasetText:body.datasetText,artifactText:null,spec,locked:true});await provider.request({method:'evm_mine',params:[]});}return json(200,spec);
      }
      if(path==='/artifacts'){
        const record=deliveries.get(body.id);if(!record?.locked||typeof body.artifactText!=='string')throw new Error('Committed order input is missing.');
        const artifact=JSON.parse(body.artifactText);if(artifact.taskId!==body.id||!('rejectionReason' in artifact)&&(!artifact.output||typeof artifact.outputHash!=='string'))throw new Error('Invalid order artifact.');
        if(record.artifactText&&record.artifactText!==body.artifactText)throw new Error('Published order artifact is immutable.');record.artifactText=body.artifactText;return json(200,{published:true});
      }
      if(path==='/settle'){
        if(!deliveries.get(body.id)?.locked)throw new Error('Unknown pre-funded order.');
        if(!settlements.has(body.id)){
          const action=(async()=>{
            const task=await client.readContract({address:escrow,abi:escrowABI,functionName:'tasks',args:[body.id]});
            if([2,3].includes(task[5])){const logs=await client.getContractEvents({address:escrow,abi:escrowABI,eventName:'Settled',args:{id:body.id},fromBlock:0n});if(!logs.length)throw new Error('Settlement event unavailable.');return {hash:logs.at(-1).transactionHash,mode:'local EOA verifier; not CRE DON'};}
            if(task[5]!==1)throw new Error('Order has no funded escrow.');
            if((await client.getBlock()).timestamp>=task[3]){
              const hash=await wallet.writeContract({address:escrow,abi:escrowABI,functionName:'refundExpired',args:[body.id],account:buyer,gas:6000000n});await client.waitForTransactionReceipt({hash});return {hash,mode:'local expired escrow refund'};
            }
            const record=deliveries.get(body.id);if(task[4]!==specHash(record.spec))throw new Error('Order specification differs from its escrow.');
            const [data,artifact]=await Promise.all([fetch(record.spec.datasetUrl),fetch(record.spec.artifactUrl)]);if(!data.ok||!artifact.ok)throw new Error('Order delivery is not ready.');
            const verdict=verifyDelivery(await data.text(),await artifact.text(),body.id,record.spec);
            const hash=await wallet.writeContract({address:escrow,abi:parseAbi(['function onReport(bytes metadata,bytes report)']),functionName:'onReport',args:[metadata,encodeSettlementReport(body.id,task[4],verdict.outputHash,verdict.accepted)],account:forwarder,gas:6000000n});const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw new Error('Order report reverted.');return {hash,accepted:verdict.accepted,mode:'local EOA verifier; not CRE DON'};
          })();settlements.set(body.id,action);action.catch(()=>settlements.delete(body.id));
        }
        return json(200,await settlements.get(body.id));
      }
      if(path==='/deliveries'){
        if(!/^0x[0-9a-f]{64}$/.test(body.id)||typeof body.datasetText!=='string'||typeof body.artifactText!=='string')throw new Error('Invalid local delivery.');
        const decoded=JSON.parse(body.datasetText),records=Array.isArray(decoded)?decoded:decoded.records;if(!Array.isArray(records))throw new Error('Invalid local dataset.');if(records.length)normalizeInput({dataset:'custom-transfers-v1',blockFrom:decoded.source||decoded.memory?body.verification.blockFrom:0,blockTo:decoded.source||decoded.memory?body.verification.blockTo:Number.MAX_SAFE_INTEGER,records,...(decoded.source?{source:decoded.source}:{}),...(decoded.memory?{memory:decoded.memory}:{})});
        validateVerification(body.verification);
        const artifact=JSON.parse(body.artifactText);if(artifact.taskId!==body.id||!artifact.output||typeof artifact.outputHash!=='string')throw new Error('Invalid local artifact.');
        const spec={datasetUrl:base+'/dataset/'+body.id,datasetHash:keccak256(stringToHex(body.datasetText)),artifactUrl:base+'/artifact/'+body.id,verification:body.verification};
        if(deliveries.get(body.id)?.locked)throw new Error('Pre-funded order evidence cannot be replaced.');deliveries.set(body.id,{datasetText:body.datasetText,artifactText:body.artifactText,spec});return json(200,spec);
      }
      if(path==='/verify'){
        const record=deliveries.get(body.id);if(!record)throw new Error('Local delivery is missing.');
        const task=await client.readContract({address:escrow,abi:escrowABI,functionName:'tasks',args:[body.id]});
        if(task[5]!==1||task[4]!==specHash(record.spec))throw new Error('Escrow is terminal or its evidence commitment differs.');
        // Actual HTTP retrieval of the published local bytes. This EOA verifier is not a DON.
        const [data,artifact]=await Promise.all([fetch(record.spec.datasetUrl),fetch(record.spec.artifactUrl)]);
        if(!data.ok||!artifact.ok)throw new Error('Local evidence is unavailable.');
        const verdict=verifyDelivery(await data.text(),await artifact.text(),body.id,record.spec);
        const hash=await wallet.writeContract({address:escrow,abi:parseAbi(['function onReport(bytes metadata,bytes report)']),functionName:'onReport',args:[metadata,encodeSettlementReport(body.id,task[4],verdict.outputHash,verdict.accepted)],account:forwarder,gas:6000000n});
        const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw new Error('Local report transaction reverted.');
        return json(200,{hash,accepted:verdict.accepted,mode:'local EOA verifier; not CRE DON'});
      }
      if(path==='/tamper'){
        const record=deliveries.get(body.id);if(!record)throw new Error('Local delivery is missing.');
        const artifact=JSON.parse(record.artifactText);artifact.output.totalCents+=1;record.artifactText=JSON.stringify(artifact);return json(200,{tampered:true});
      }
      if(path==='/time'){
        if(!Number.isSafeInteger(body.seconds)||body.seconds<1||body.seconds>604801)throw new Error('Invalid local time increment.');
        await provider.request({method:'evm_increaseTime',params:[body.seconds]});await provider.request({method:'evm_mine',params:[]});return json(200,{advanced:body.seconds});
      }
      return json(404,{error:'Route not found.'});
    }catch(error){return json(400,{error:error instanceof Error?error.message:'Local test operation failed.'});}
  });
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}catch(error){await provider.disconnect();throw error;}
  base='http://127.0.0.1:'+server.address().port;
  return {base,config,buyer,provider,close:async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await provider.disconnect();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  console.log('Preparing local EVM contracts'+(process.env.AGENTOS_DEMO_SKIP_IDENTITY==='1'?' (Vault-only validation; identity disabled)':' including official identity registries')+'…');
  const local=await startLocalChain({port:Number(process.env.AGENTOS_CHAIN_PORT||8545),appOrigin:process.env.AGENTOS_APP_ORIGIN||'http://127.0.0.1:5177',identity:process.env.AGENTOS_DEMO_SKIP_IDENTITY!=='1',stateDirectory:process.env.AGENTOS_CHAIN_STATE});
  console.log('AgentOS temporary local EVM: '+local.base+' (chain 31337; test tokens; no DON)');
  console.log('Public deployment: '+JSON.stringify(local.config));
  let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;await local.close();process.exitCode=0;});
}
