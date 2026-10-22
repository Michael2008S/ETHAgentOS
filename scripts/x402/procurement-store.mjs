import {Journal} from './storage.mjs';
import {canonical} from '../../cre/workflow/verify.ts';

export class ProcurementStore extends Journal {
 reserve(id,binding,amount,dailyAmount,details={},now=Date.now()){
  return this.transaction(()=>{
   const prior=this.get('purchases',id);
   if(prior){if(canonical(prior.binding)!==canonical(binding)||prior.amount!==amount)throw Error('Procurement identifier conflicts with original terms.');return prior;}
   const group=r=>r.binding.network===binding.network&&r.binding.asset===binding.asset&&r.binding.payer===binding.payer;
   const day=new Date(now).toISOString().slice(0,10),used=this.rows('purchases').filter(group).filter(r=>r.state!=='unpaid'&&(!r.payment||new Date(Number(r.payment.blockTimestamp)*1000).toISOString().slice(0,10)===day)).reduce((n,r)=>n+BigInt(r.amount),0n);
   if(used+BigInt(amount)>BigInt(dailyAmount))throw Object.assign(Error('Shared x402 procurement daily cap reached.'),{terminal:true});
   return this.put('purchases',id,{id,binding,amount,...details,state:'reserved',createdAt:new Date(now).toISOString()});
  });
 }
 update(id,changes){return this.transaction(()=>{const row=this.get('purchases',id);if(!row)throw Error('Unknown procurement.');return this.put('purchases',id,{...row,...changes});});}
 intent(id,data){return this.transaction(()=>{const row=this.get('purchases',id);if(row.intent&&canonical(row.intent)!==canonical(data))throw Error('An x402 purchase cannot create a second nonce.');return this.put('purchases',id,{...row,intent:data,state:'authorized'});});}
 summary(){const rows=this.rows('purchases');return {spent:rows.filter(r=>r.payment).reduce((n,r)=>n+BigInt(r.amount),0n).toString(),reserved:rows.filter(r=>!r.payment&&r.state!=='unpaid').reduce((n,r)=>n+BigInt(r.amount),0n).toString(),purchases:rows.length};}
}
