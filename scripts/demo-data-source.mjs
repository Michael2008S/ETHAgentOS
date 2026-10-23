import {dataRpc,verifyTransferSource} from '../lib/agentos/chain-data.ts';
/** Bind CLI checks to the selected app's read-only source instead of mixing live and replay. */
export function demoSourceEnvironment(runtime){
 const proxy=runtime.sourceProxyURL??runtime.replayURL;if(!proxy)return {};
 const base=new URL(runtime.baseURL),source=new URL(proxy);
 if(base.hostname!=='127.0.0.1'||base.protocol!=='http:'||source.hostname!=='127.0.0.1'||source.protocol!=='http:'||source.pathname!=='/'||source.search||source.hash||source.username||source.password)throw Error('Demo source binding requires plain loopback runtime URLs.');
 return {AGENTOS_DATA_RPC_URL:source.origin+(runtime.capturedSource?'/captured-usdc':'/live-usdc'),AGENTOS_DEMO_DATA_SOURCE:runtime.capturedSource?'captured-finalized-replay':'live-finalized-read'};
}
export const demoSourceMode=()=>process.env.AGENTOS_DEMO_DATA_SOURCE??'live-finalized-read';
function allowLocal(url){return ['captured-finalized-replay','live-finalized-read'].includes(process.env.AGENTOS_DEMO_DATA_SOURCE)&&new URL(url).hostname==='127.0.0.1';}
export const demoDataRpc=(url,request=fetch)=>dataRpc(url,request,allowLocal(url));
export const verifyDemoTransferSource=(url,source,request=fetch)=>verifyTransferSource(url,source,request,allowLocal(url));
export const demoSourceDescription=()=>demoSourceMode()==='captured-finalized-replay'?'historical finalized Ethereum USDC capture replay; local test-token payments':'read-only live finalized Ethereum USDC; local test-token payments';
