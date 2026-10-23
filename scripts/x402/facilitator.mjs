import {facilitator} from './protocol.mjs';
import {Journal} from './storage.mjs';
import {localServer,readJson} from './http.mjs';
import {x402RequirementsSchema} from '../../lib/agentos/x402-policy.ts';
import {durableGasSender} from './gas-journal.mjs';

export async function startFacilitator({client,wallet,asset,payTo,port=0,journalPath,dailyGasWei=50000000000000000n,afterBroadcast,journal:providedJournal}){
 if(typeof dailyGasWei!=='bigint'||dailyGasWei<1n||dailyGasWei>50000000000000000n)throw Error('Invalid local gas budget.');
 const journal=providedJournal??new Journal(journalPath),gas=durableGasSender({client,wallet,journal,dailyGasWei,afterBroadcast});
 const signer={...client,getAddresses:()=>[wallet.account.address],writeContract:args=>gas.send('writeContract',args),sendTransaction:args=>gas.send('sendTransaction',args)},sdk=facilitator(signer,client,asset,journal);
 const server=await localServer(async(req,json,base)=>{
  const path=new URL(req.url,base).pathname;
  if(req.method==='GET'&&path==='/health')return json(200,{status:'ok'});
  if(req.method==='GET'&&path==='/gas'){await gas.reconcile();return json(200,gas.summary());}
  if(req.method==='GET'&&path==='/supported')return json(200,{kinds:[{x402Version:2,scheme:'exact',network:'eip155:31337'}],extensions:[],signers:{'eip155:*':[wallet.account.address]}});
  if(req.method!=='POST'||!['/verify','/settle'].includes(path))return json(404,{});
  const b=await readJson(req),r=x402RequirementsSchema.parse(b.paymentRequirements);
  if(r.asset!==asset.toLowerCase()||r.payTo!==payTo.toLowerCase())return json(403,{});
  try{await gas.reconcile();
   const result=path==='/verify'?await sdk.verify(b.paymentPayload,r):await sdk.settle(b.paymentPayload,r);
   json(200,result);
  }catch(error){if(!error.status)error.status=503;throw error;}
 },port);
 return {...server,close:async()=>{await server.close();journal.close();}};
}
