import {encodeFunctionData,keccak256} from 'viem';
import {digest} from '../../lib/agentos/engine.ts';
const safe=v=>JSON.parse(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?x.toString():x));
/** A signed transaction and its locally computed hash commit before any broadcast. */
export function durableGasSender({client,wallet,journal,dailyGasWei,afterBroadcast=async()=>{}}){
 const gasLimit=300000n,maxFeePerGas=25000000000n,ceiling=gasLimit*maxFeePerGas;
 async function reconcileOne(id,row){
  if(!row.transaction)return null;
  let receipt;try{receipt=await client.getTransactionReceipt({hash:row.transaction});}catch{return null;}
  const block=await client.getBlock({blockNumber:receipt.blockNumber});if(block.hash!==receipt.blockHash)throw Error('Facilitator receipt is not canonical.');
  journal.put('gas',id,{...row,stage:'confirmed',day:new Date(Number(block.timestamp)*1000).toISOString().slice(0,10),receipt:true,costWei:String(receipt.gasUsed*receipt.effectiveGasPrice),gasUsed:String(receipt.gasUsed),effectiveGasPrice:String(receipt.effectiveGasPrice),blockHash:receipt.blockHash});return receipt;
 }
 async function reconcile(){for(const {id,value:row} of journal.entries('gas'))if(!row.receipt&&row.transaction)await reconcileOne(id,row);}
 async function send(kind,args){
  const intent=safe({kind,args}),id=await digest(intent),today=new Date().toISOString().slice(0,10);await reconcile();
  journal.transaction(()=>{if(journal.get('gas',id))return;const used=journal.rows('gas').filter(r=>!r.receipt||r.day===today).reduce((n,r)=>n+BigInt(r.receipt?r.costWei:r.reservedWei),0n);if(used+ceiling>dailyGasWei)throw Error('Local facilitator daily gas cap reached.');journal.put('gas',id,{version:2,id,intent,stage:'reserved',day:today,reservedWei:String(ceiling),gasLimit:String(gasLimit),maxFeePerGas:String(maxFeePerGas)});});
  let row=journal.get('gas',id);if(await reconcileOne(id,row))return row.transaction;
  if(!row.raw){
   if(row.version!==2||row.stage!=='reserved')throw Error('Original facilitator gas intent awaits reconciliation.');
   const pending=await client.getTransactionCount({address:wallet.account.address,blockTag:'pending'});
   journal.transaction(()=>{row=journal.get('gas',id);if(row.nativeNonce===undefined){const nonce=Math.max(pending,...journal.rows('gas').filter(r=>r.nativeNonce!==undefined).map(r=>r.nativeNonce+1));row=journal.put('gas',id,{...row,nativeNonce:nonce});}});
   const {abi,functionName,args:parameters,address,...rest}=args,data=kind==='writeContract'?encodeFunctionData({abi,functionName,args:parameters}):args.data;
   const prepared=await wallet.prepareTransactionRequest({...rest,...(address?{to:address}:{}),...(data?{data}:{}),account:wallet.account,nonce:row.nativeNonce,gas:gasLimit,maxFeePerGas,maxPriorityFeePerGas:1000000000n});
   const raw=await wallet.account.signTransaction(prepared),transaction=keccak256(raw);row=journal.put('gas',id,{...row,raw,transaction,stage:'signed'});
  }
  // An unavailable RPC or a failed disk write never releases this reservation.
  const transaction=await client.sendRawTransaction({serializedTransaction:row.raw});if(transaction!==row.transaction)throw Error('Broadcast hash differs from the committed transaction.');
  await afterBroadcast(row);journal.put('gas',id,{...row,stage:'broadcast'});
  await client.waitForTransactionReceipt({hash:row.transaction});await reconcileOne(id,journal.get('gas',id));return row.transaction;
 }
 return {send,reconcile,summary:()=>({gasLimit:String(gasLimit),maxFeePerGas:String(maxFeePerGas),dailyGasWei:String(dailyGasWei),spentWei:journal.rows('gas').filter(r=>r.receipt).reduce((n,r)=>n+BigInt(r.costWei),0n).toString(),reservedWei:journal.rows('gas').filter(r=>!r.receipt).reduce((n,r)=>n+BigInt(r.reservedWei),0n).toString(),transactions:journal.rows('gas').filter(r=>r.receipt).length})};
}
