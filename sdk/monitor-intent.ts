import {canonical} from '../cre/workflow/verify.ts';
import {usdcMonitorDraftSchema,type USDCMonitorDraft} from '../lib/agentos/usdc-monitor-state.ts';
import type {WalletDeployment} from './wallet.ts';
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
const key=(scope:string)=>'agentos.monitor-intent.v1:'+scope;
/** Public proposal only; wallet signatures remain in the existing server session. */
export function saveMonitorIntent(storage:Storage,scope:string,deployment:WalletDeployment,draft:USDCMonitorDraft){storage.setItem(key(scope),JSON.stringify({scope,deployment,draft:usdcMonitorDraftSchema.parse(draft)}));}
export function loadMonitorIntent(storage:Storage,scope:string,deployment:WalletDeployment,buyer:string){try{const saved=JSON.parse(storage.getItem(key(scope))??'null');if(!saved||saved.scope!==scope||canonical(saved.deployment)!==canonical(deployment)||saved.draft.buyer.toLowerCase()!==buyer.toLowerCase())return;return usdcMonitorDraftSchema.parse(saved.draft);}catch{return;}}
export function clearMonitorIntent(storage:Storage,scope:string){storage.removeItem(key(scope));}
