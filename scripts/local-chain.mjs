import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import ganache from 'ganache';
import { createPublicClient, createWalletClient, custom, keccak256, parseAbi, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { compile } from './compile-contracts.mjs';
import { normalizeInput } from '../lib/agentos/engine.ts';
import { encodeSettlementReport, escrowABI } from '../sdk/chain.ts';
import { specHash, verifyDelivery } from '../cre/workflow/verify.ts';

const rpcMethods=new Set(['personal_sign','eth_chainId','eth_accounts','eth_blockNumber','eth_call','eth_getBalance','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getBlockByNumber','eth_getBlockByHash','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory','eth_getTransactionCount','eth_sendTransaction','web3_clientVersion','net_version','eth_getCode','eth_getLogs']);
export async function startLocalChain({port=8545,appOrigin='http://127.0.0.1:5177'}={}){
  const origin=new URL(appOrigin);if(!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw new Error('Local chain requires a loopback app origin.');
  const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',chainId:31337}});
  const client=createPublicClient({transport:custom(provider),cacheTime:0}),wallet=createWalletClient({transport:custom(provider),chain:null});
  const [buyer,seller,forwarder]=await wallet.getAddresses(),artifacts=compile();
  async function deploy(name,args=[]){const hash=await wallet.deployContract({...artifacts[name],account:buyer,args,gas:6000000n});return(await client.waitForTransactionReceipt({hash})).contractAddress;}
  const token=await deploy('MockToken'),metadata=stringToHex('agentos-local-verifier:v1'),metadataHash=keccak256(metadata),escrow=await deploy('AgentEscrow',[token,forwarder,metadataHash]);
  await client.waitForTransactionReceipt({hash:await wallet.writeContract({address:token,abi:artifacts.MockToken.abi,functionName:'mint',args:[buyer,100000000n],account:buyer,gas:6000000n})});
  const config={mode:'local',chainId:31337,token,escrow,forwarder,metadataHash,confirmations:1,seller,deployedBlock:'0'},deliveries=new Map();
  let base;
  const server=createServer(async(req,res)=>{
    const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
    try{
      if(req.headers.host!==new URL(base).host||req.headers.origin&&req.headers.origin!==origin.origin)return json(403,{error:'Local chain origin rejected.'});
      if(req.headers.origin)res.setHeader('Access-Control-Allow-Origin',origin.origin);
      if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});res.end();return;}
      const path=new URL(req.url,base).pathname;
      if(req.method==='GET'&&path==='/config')return json(200,config);
      const specMatch=path.match(/^\/spec\/(0x[0-9a-f]{64})$/);
      if(req.method==='GET'&&specMatch){const record=deliveries.get(specMatch[1]);return record?json(200,record.spec):json(404,{error:'Delivery not found.'});}
      const match=path.match(/^\/(dataset|artifact)\/(0x[0-9a-f]{64})$/);
      if(req.method==='GET'&&match){const record=deliveries.get(match[2]);if(!record)return json(404,{error:'Delivery not found.'});res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(match[1]==='dataset'?record.datasetText:record.artifactText);return;}
      if(req.method!=='POST')return json(404,{error:'Route not found.'});
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536)throw new Error('Local request too large.');}const body=JSON.parse(raw);
      if(path==='/rpc'){
        const {id,method,params=[]}=body;
        if(!rpcMethods.has(method))return json(200,{jsonrpc:'2.0',id,error:{code:-32601,message:'Method is not enabled in the local test wallet.'}});
        if(method==='personal_sign'){
          if(params[1]?.toLowerCase()!==buyer.toLowerCase()||typeof params[0]!=='string'||!/^0x[0-9a-fA-F]+$/.test(params[0])||params[0].length>32770||!Buffer.from(params[0].slice(2),'hex').toString().startsWith('AgentOS chain reconciliation v1\n'))return json(200,{jsonrpc:'2.0',id,error:{code:-32602,message:'Local wallet only signs AgentOS receipt challenges for its buyer.'}});
          const account=privateKeyToAccount(provider.getInitialAccounts()[buyer.toLowerCase()].secretKey);
          return json(200,{jsonrpc:'2.0',id,result:await account.signMessage({message:{raw:params[0]}})});
        }
        if(method==='eth_sendTransaction'&&(params[0]?.from?.toLowerCase()!==buyer.toLowerCase()||![token,escrow].some(address=>address.toLowerCase()===params[0]?.to?.toLowerCase())))return json(200,{jsonrpc:'2.0',id,error:{code:-32602,message:'Local wallet only signs buyer calls to this test deployment.'}});
        try{return json(200,{jsonrpc:'2.0',id,result:await provider.request({method,params})});}catch(error){return json(200,{jsonrpc:'2.0',id,error:{code:error.code??-32000,message:error.message}});}
      }
      if(path==='/deliveries'){
        if(!/^0x[0-9a-f]{64}$/.test(body.id)||typeof body.datasetText!=='string'||typeof body.artifactText!=='string')throw new Error('Invalid local delivery.');
        const records=JSON.parse(body.datasetText);if(!Array.isArray(records))throw new Error('Invalid local dataset.');if(records.length)normalizeInput({dataset:'custom-transfers-v1',blockFrom:0,blockTo:Number.MAX_SAFE_INTEGER,records});
        const artifact=JSON.parse(body.artifactText);if(artifact.taskId!==body.id||!Number.isSafeInteger(artifact.totalCents)||!Number.isSafeInteger(artifact.transferCount))throw new Error('Invalid local artifact.');
        const spec={datasetUrl:base+'/dataset/'+body.id,datasetHash:keccak256(stringToHex(body.datasetText)),artifactUrl:base+'/artifact/'+body.id};
        deliveries.set(body.id,{datasetText:body.datasetText,artifactText:body.artifactText,spec});return json(200,spec);
      }
      if(path==='/verify'){
        const record=deliveries.get(body.id);if(!record)throw new Error('Local delivery is missing.');
        const task=await client.readContract({address:escrow,abi:escrowABI,functionName:'tasks',args:[body.id]});
        if(task[5]!==1||task[4]!==specHash(record.spec))throw new Error('Escrow is terminal or its evidence commitment differs.');
        // Actual HTTP retrieval of the published local bytes. This EOA verifier is not a DON.
        const [data,artifact]=await Promise.all([fetch(record.spec.datasetUrl),fetch(record.spec.artifactUrl)]);
        if(!data.ok||!artifact.ok)throw new Error('Local evidence is unavailable.');
        const verdict=verifyDelivery(await data.text(),await artifact.text(),body.id,record.spec.datasetHash);
        const hash=await wallet.writeContract({address:escrow,abi:parseAbi(['function onReport(bytes metadata,bytes report)']),functionName:'onReport',args:[metadata,encodeSettlementReport(body.id,task[4],verdict.outputHash,verdict.accepted)],account:forwarder,gas:6000000n});
        const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw new Error('Local report transaction reverted.');
        return json(200,{hash,accepted:verdict.accepted,mode:'local EOA verifier; not CRE DON'});
      }
      if(path==='/tamper'){
        const record=deliveries.get(body.id);if(!record)throw new Error('Local delivery is missing.');
        const artifact=JSON.parse(record.artifactText);artifact.totalCents+=1;record.artifactText=JSON.stringify(artifact);return json(200,{tampered:true});
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
  const local=await startLocalChain({port:Number(process.env.AGENTOS_CHAIN_PORT||8545),appOrigin:process.env.AGENTOS_APP_ORIGIN||'http://127.0.0.1:5177'});
  console.log('AgentOS temporary local EVM: '+local.base+' (chain 31337; test tokens; no DON)');
  console.log('Public deployment: '+JSON.stringify(local.config));
  let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;await local.close();process.exitCode=0;});
}
