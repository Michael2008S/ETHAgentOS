import {facilitator} from './protocol.mjs';
import {Journal} from './storage.mjs';
import {localServer,readJson} from './http.mjs';
import {x402RequirementsSchema} from '../../lib/agentos/x402-policy.ts';

export async function startFacilitator({client,wallet,asset,payTo,port=0,journalPath}){
 const journal=new Journal(journalPath),signer={...client,getAddresses:()=>[wallet.account.address],writeContract:args=>wallet.writeContract({...args,gas:300000n}),sendTransaction:args=>wallet.sendTransaction({...args,gas:300000n})},sdk=facilitator(signer,client,asset,journal);
 const server=await localServer(async(req,json,base)=>{
  const path=new URL(req.url,base).pathname;
  if(req.method==='GET'&&path==='/health')return json(200,{status:'ok'});
  if(req.method==='GET'&&path==='/supported')return json(200,{kinds:[{x402Version:2,scheme:'exact',network:'eip155:31337'}],extensions:[],signers:{'eip155:*':[wallet.account.address]}});
  if(req.method!=='POST'||!['/verify','/settle'].includes(path))return json(404,{});
  const b=await readJson(req),r=x402RequirementsSchema.parse(b.paymentRequirements);
  if(r.asset!==asset.toLowerCase()||r.payTo!==payTo.toLowerCase())return json(403,{});
  const result=path==='/verify'?await sdk.verify(b.paymentPayload,r):await sdk.settle(b.paymentPayload,r);
  json(200,result);
 },port);
 return {...server,close:async()=>{await server.close();journal.close();}};
}
