import type { Address, Hex } from 'viem';
import {validateVerification,type DeliverySpec} from './verify.ts';
export type Config={schedule:string;chainName:string;escrowAddress:Address;taskId:Hex;gasLimit:string;spec:DeliverySpec};
const hex=(value:unknown,length:number)=>typeof value==='string'&&new RegExp(`^0x[0-9a-fA-F]{${length}}$`).test(value)&&!/^0x0+$/.test(value);
function https(value: unknown): value is string {
  // Avoid browser URL globals in the QuickJS/WASM runtime; require a plain DNS authority.
  return typeof value==='string'&&/^https:\/\/[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+(?:\:[0-9]{1,5})?(?:[/?][^\s#]*)?$/.test(value)&&!value.includes('YOUR_');
}
/** Reject placeholders before any HTTP fetch or chain write. No keys are part of this config. */
export function validateConfig(value: unknown): Config {
  if(!value||typeof value!=='object')throw new Error('CRE configuration must be an object.');
  const c=value as Config;
  if(typeof c.schedule!=='string'||c.schedule.length>80||![5,6].includes(c.schedule.trim().split(/\s+/).length))throw new Error('Invalid CRE cron schedule.');
  if(typeof c.chainName!=='string'||!c.chainName.trim()||c.chainName.length>100)throw new Error('Invalid CRE chain name.');
  if(!hex(c.escrowAddress,40)||!hex(c.taskId,64))throw new Error('Configure an actual escrow address and task ID.');
  if(typeof c.gasLimit!=='string'||!/^\d+$/.test(c.gasLimit)||BigInt(c.gasLimit)<100000n||BigInt(c.gasLimit)>5000000n)throw new Error('CRE gas limit must be 100000–5000000.');
  if(!c.spec||!https(c.spec.datasetUrl)||!https(c.spec.artifactUrl)||!hex(c.spec.datasetHash,64))throw new Error('Configure HTTPS evidence URLs and the exact dataset hash.');
  validateVerification(c.spec.verification);
  return {...c,escrowAddress:c.escrowAddress.toLowerCase() as Address,taskId:c.taskId.toLowerCase() as Hex,spec:{...c.spec,datasetHash:c.spec.datasetHash.toLowerCase() as Hex}};
}
export const parseConfig=(bytes: Uint8Array)=>validateConfig(JSON.parse(new TextDecoder().decode(bytes)));
