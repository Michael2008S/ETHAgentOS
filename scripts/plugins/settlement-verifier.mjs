import {canonical} from '../../cre/workflow/verify.ts';
import {digest} from '../../lib/agentos/engine.ts';
import {verifyPluginExecution,pluginExecutionTerms,pluginManifestHash} from '../../lib/agentos/plugin-protocol.ts';
import {executePlugin} from './sandbox.mjs';

/** Independent acceptance uses the buyer-committed descriptor, never a signer
 * or tool catalogue chosen by the submitted artifact. MCP truth still rests on
 * that authenticated source; replay is not a proof of arbitrary semantic truth. */
export async function verifyPluginForSettlement(request,execution,runtime){
 const {configHash,...terms}=runtime;
 if(await digest(terms)!==configHash||configHash!==request.runtimeHash||!/^0x[0-9a-fA-F]{40}$/.test(runtime.deliverySigner??'')||await pluginManifestHash(request.manifest)!==request.manifestHash||await digest(request.input)!==request.inputHash)throw Error('Paid plugin runtime or input commitment differs.');
 if(request.manifest.tools.some(t=>!runtime.tools.some(c=>c.serverId===t.serverId&&c.name===t.name&&c.toolHash===t.toolHash&&c.readOnly)))throw Error('Paid plugin capabilities differ.');
 await verifyPluginExecution(execution,{...request,runtimeSigner:runtime.deliverySigner});
 const seen=new Set();let replay;try{replay=await executePlugin(request,async call=>{
  const record=execution.transcript[call.ordinal];
  if(!record||seen.has(call.ordinal)||record.serverId!==call.serverId||record.name!==call.name||record.toolHash!==call.toolHash||canonical(record.arguments)!==canonical(call.arguments))throw Error('Paid plugin replay differs from its authenticated transcript.');
  seen.add(call.ordinal);return structuredClone(record.result);
 });}catch{throw Error('Paid plugin independent replay or reviewed verifier refused the delivery.');}
 if(seen.size!==execution.transcript.length||canonical(pluginExecutionTerms(replay))!==canonical(pluginExecutionTerms(execution)))throw Error('Paid plugin output differs from independent replay.');
 return {version:'agentos.plugin-settlement-verdict.v1',policy:'replay-and-reviewed-verifier.v1',accepted:true,executionDigest:execution.digest,manifestHash:request.manifestHash,inputHash:request.inputHash,runtimeHash:configHash};
}
