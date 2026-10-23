import {mkdirSync} from 'node:fs';
import {readLocalState,writeLocalState} from '../local-state.mjs';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,encodeAbiParameters,keccak256,toHex,zeroHash} from 'viem';
import {compile} from '../compile-contracts.mjs';

// In-process EVMs: distinct chain IDs and providers, no RPC ports or child processes.
export async function createCCIPFixture({root}={}){
 const artifacts=compile(),providers=[];
 const metadata=toHex('local-ccip-escrow-verifier'),spec=keccak256(toHex('bounded-local-task-v1'));
 async function chain(chainId){
  if(root)mkdirSync(root+'/'+chainId,{recursive:true,mode:0o700});
  const path=root?root+'/'+chainId+'/deployment.bin':undefined,saved=readLocalState(path,null),seed=saved?.seed??crypto.randomUUID();
  if(saved&&!saved.lane)throw Error('Incomplete CCIP deployment; preserve it and restore a verified backup.');
  if(!saved)writeLocalState(path,{seed});
  const provider=ganache.provider({chain:{chainId,hardfork:'shanghai'},logging:{quiet:true},wallet:{totalAccounts:3,seed},...(root?{database:{dbPath:root+'/'+chainId+'/evm'}}:{})});providers.push(provider);
  const client=createPublicClient({transport:custom(provider),cacheTime:0}),wallet=createWalletClient({transport:custom(provider)});
  const [owner,seller]=await wallet.getAddresses();
  async function tx(address,name,args=[]){
   const abi=Object.values(artifacts).find(a=>a.abi.some(i=>i.type==='function'&&i.name===name))?.abi;
   // All deployed addresses have their exact ABI registered below.
   const contractAbi=abis.get(address)||abi;
   const hash=await wallet.writeContract({account:owner,address,abi:contractAbi,functionName:name,args,gas:8_000_000n,chain:null});
   const receipt=await client.waitForTransactionReceipt({hash});
   if(receipt.status!=='success')throw Error('reverted '+name);
   return receipt;
  }
  const abis=new Map();
  async function deploy(name,args=[]){const a=artifacts[name],hash=await wallet.deployContract({account:owner,abi:a.abi,bytecode:a.bytecode,args,gas:8_000_000n,chain:null});const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw Error('deploy '+name);abis.set(receipt.contractAddress,a.abi);return receipt.contractAddress;}
  let token,escrow,vault,router;
  if(saved){({token,escrow,vault,router}=saved);for(const [address,name]of [[token,'MockToken'],[escrow,'AgentEscrow'],[vault,'AgentVault'],[router,'LocalMockRouter'],[saved.lane,'LocalCCIPTaskLane']]){abis.set(address,artifacts[name].abi);if(!await client.getCode({address})||await client.getCode({address})==='0x')throw Error('Persistent CCIP deployment missing code.');}}
  else {token=await deploy('MockToken');escrow=await deploy('AgentEscrow',[token,owner,keccak256(metadata)]);vault=await deploy('AgentVault',[escrow]);router=await deploy('LocalMockRouter');}
  const read=(address,functionName,args=[])=>client.readContract({address,abi:abis.get(address),functionName,args});
  return {chainId,provider,client,wallet,owner,seller,token,escrow,vault,router,deploy,read,tx,abis,saved,path,seed};
 }
 try {
  const a=await chain(31338),b=await chain(31339),cap=10_000_000n;
  a.selector=1001n;b.selector=1002n;
  a.lane=a.saved?.lane??await a.deploy('LocalCCIPTaskLane',[a.router,a.vault,b.selector,true,cap]);
  b.lane=b.saved?.lane??await b.deploy('LocalCCIPTaskLane',[b.router,b.vault,a.selector,false,cap]);
  for(const [c,peer]of[[a,b],[b,a]]){
   if(c.saved)continue;
   await c.tx(c.lane,'bind',[peer.lane,c.seller]);await c.tx(c.token,'mint',[c.vault,cap]);
   const now=Number((await c.client.getBlock()).timestamp);
   await c.tx(c.vault,'allowSeller',[c.seller,true]);await c.tx(c.vault,'grant',[c.lane,3_000_000n,cap,BigInt(now+86400)]);
  }
  for(const c of [a,b])writeLocalState(c.path,{seed:c.seed,token:c.token,escrow:c.escrow,vault:c.vault,router:c.router,lane:c.lane});
  const deadline=BigInt(Number((await b.client.getBlock()).timestamp)+3600);
  async function messages(c,receipt){const logs=await c.client.getContractEvents({address:c.router,abi:artifacts.LocalMockRouter.abi,eventName:'Sent',fromBlock:receipt.blockNumber,toBlock:receipt.blockNumber});return logs.filter(l=>l.transactionHash===receipt.transactionHash).map(l=>({messageId:l.args.messageId,sourceChainSelector:c.selector,sender:encodeAbiParameters([{type:'address'}],[l.args.sender]),data:l.args.data,destTokenAmounts:[]}));}
  async function deliver(to,message){return to.tx(to.router,'deliver',[to.lane,message]);}
  const authorize=async(id,amount=1_000_000n,expires=deadline)=>messages(a,await a.tx(a.lane,'authorize',[id,amount,expires,spec]));
  const task=(c,id)=>c.read(c.lane,'tasks',[id]);
  async function settle(id,accepted){await b.tx(b.escrow,'onReport',[metadata,encodeAbiParameters([{type:'bytes32'},{type:'bytes32'},{type:'bytes32'},{type:'bool'}],[id,spec,accepted?keccak256(toHex('accepted-local-output')):zeroHash,accepted])]);return messages(b,await b.tx(b.lane,'collect',[id]));}
  async function roundtrip(result){const ack=await messages(a,await deliver(a,result));await deliver(b,ack[0]);}
  return {a,b,cap,spec,metadata,deadline,messages,deliver,authorize,task,settle,roundtrip,id:label=>keccak256(toHex(label)),close:async()=>{await Promise.all(providers.map(p=>p.disconnect()));}};
 } catch(error){await Promise.all(providers.map(p=>p.disconnect()));throw error;}
}
