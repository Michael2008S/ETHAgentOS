// Private-file IPC for crash acceptance; never log the test account key or payload.
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {ProcurementStore} from '../scripts/x402/procurement-store.mjs';
import {procurementClient} from '../scripts/x402/client.mjs';
const c=JSON.parse(await readFile(process.argv[2],'utf8')),store=new ProcurementStore(c.store),crash=async row=>{await writeFile(c.marker,JSON.stringify({nonce:row.payload.payload.authorization.nonce,payment:row.payment?.transaction}),{mode:0o600});process.kill(process.pid,'SIGKILL');};
try{const procurement=procurementClient({policy:c.policy,account:privateKeyToAccount(c.key),client:createPublicClient({transport:http(c.rpc),cacheTime:0}),store,authorize:async()=>({authorized:true}),...(c.phase==='before-send'?{afterPersist:crash}:c.phase==='after-payment'?{afterPayment:crash}:{})}),result=await procurement.execute(c.request,'controlled-crash-ticket');await writeFile(c.result,JSON.stringify(result),{mode:0o600});}finally{store.close();}
