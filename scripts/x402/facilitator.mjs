import {facilitator} from './protocol.mjs';
import {Journal} from './storage.mjs';
import {localServer,readJson} from './http.mjs';
import {x402RequirementsSchema} from '../../lib/agentos/x402-policy.ts';
import {digest} from '../../lib/agentos/engine.ts';

export async function startFacilitator({client,wallet,asset,payTo,port=0,journalPath,dailyGasWei=50000000000000000n}){
 if(typeof dailyGasWei!=='bigint'||dailyGasWei<1n||dailyGasWei>50000000000000000n)throw Error('Invalid local gas budget.');
 const journal=new Journal(journalPath),gasLimit=300000n,maxFeePerGas=25000000000n;
 async function send(kind,args){
  // Native gas is an independent supplier expense, never added to user escrow.
  const intent=JSON.parse(JSON.stringify({kind,args},(_k,v)=>typeof v==='bigint'?v.toString():v)),id=await digest(intent),today=new Date().toISOString().slice(0,10),ceiling=gasLimit*maxFeePerGas;
  journal.transaction(()=>{if(journal.get('gas',id))throw Error('Original facilitator gas intent awaits reconciliation.');const used=journal.rows('gas').filter(r=>!r.receipt||r.day===today).reduce((n,r)=>n+BigInt(r.costWei??r.reservedWei),0n);if(used+ceiling>dailyGasWei)throw Error('Local facilitator daily gas cap reached.');journal.put('gas',id,{day:today,reservedWei:String(ceiling),gasLimit:String(gasLimit),maxFeePerGas:String(maxFeePerGas)});});
  const hash=await wallet[kind]({...args,gas:gasLimit,maxFeePerGas,maxPriorityFeePerGas:1000000000n});journal.put('gas',id,{...journal.get('gas',id),transaction:hash});
  const receipt=await client.waitForTransactionReceipt({hash}),block=await client.getBlock({blockNumber:receipt.blockNumber});journal.put('gas',id,{...journal.get('gas',id),day:new Date(Number(block.timestamp)*1000).toISOString().slice(0,10),receipt:true,costWei:String(receipt.gasUsed*receipt.effectiveGasPrice),gasUsed:String(receipt.gasUsed),effectiveGasPrice:String(receipt.effectiveGasPrice),blockHash:receipt.blockHash});return hash;
 }
 const signer={...client,getAddresses:()=>[wallet.account.address],writeContract:args=>send('writeContract',args),sendTransaction:args=>send('sendTransaction',args)},sdk=facilitator(signer,client,asset,journal);
 const server=await localServer(async(req,json,base)=>{
  const path=new URL(req.url,base).pathname;
  if(req.method==='GET'&&path==='/health')return json(200,{status:'ok'});
  if(req.method==='GET'&&path==='/gas')return json(200,{gasLimit:String(gasLimit),maxFeePerGas:String(maxFeePerGas),dailyGasWei:String(dailyGasWei),spentWei:journal.rows('gas').filter(r=>r.receipt).reduce((n,r)=>n+BigInt(r.costWei),0n).toString(),reservedWei:journal.rows('gas').filter(r=>!r.receipt).reduce((n,r)=>n+BigInt(r.reservedWei),0n).toString(),transactions:journal.rows('gas').filter(r=>r.receipt).length});
  if(req.method==='GET'&&path==='/supported')return json(200,{kinds:[{x402Version:2,scheme:'exact',network:'eip155:31337'}],extensions:[],signers:{'eip155:*':[wallet.account.address]}});
  if(req.method!=='POST'||!['/verify','/settle'].includes(path))return json(404,{});
  const b=await readJson(req),r=x402RequirementsSchema.parse(b.paymentRequirements);
  if(r.asset!==asset.toLowerCase()||r.payTo!==payTo.toLowerCase())return json(403,{});
  const result=path==='/verify'?await sdk.verify(b.paymentPayload,r):await sdk.settle(b.paymentPayload,r);
  json(200,result);
 },port);
 return {...server,close:async()=>{await server.close();journal.close();}};
}
