import {parentPort,workerData} from 'node:worker_threads';
import {newQuickJSWASMModule} from 'quickjs-emscripten';
// Guest code executes only inside this independent WASM interpreter. Node objects,
// module loaders, filesystem, environment and network handles are never injected.
const {code,input,limits,verify}=workerData,QuickJS=await newQuickJSWASMModule(),runtime=QuickJS.newRuntime();
runtime.setMemoryLimit(limits.memoryMb*1024*1024);runtime.setMaxStackSize(256*1024);
const vm=runtime.newContext(),pending=new Map();let remaining=limits.cpuMs,deadline=0,ordinal=0,finished=false,wake;
const cpuClock=()=>{const value=process.threadCpuUsage();return value.user+value.system;};
runtime.setInterruptHandler(()=>cpuClock()>deadline);
function cpu(fn){if(remaining<=0)throw Error('budget');const before=cpuClock();deadline=before+remaining*1000;try{return fn();}finally{remaining-=(cpuClock()-before)/1000;}}
function settle(message){if(finished)return;const deferred=pending.get(message.ordinal);if(!deferred)return;pending.delete(message.ordinal);try{cpu(()=>{const value=message.error?vm.newError('Tool capability refused or unavailable.'):vm.newString(message.json);try{if(message.error)deferred.reject(value);else deferred.resolve(value);}finally{value.dispose();}});}catch{finished=true;parentPort.postMessage({error:true,reason:remaining<=0?'cpu-limit':'vm-rejected'});}finally{deferred.dispose();const resume=wake;wake=undefined;resume?.();}}
parentPort.on('message',settle);
const call=vm.newFunction('__agentosTool',(server,name,args)=>{
 if(verify||ordinal>=limits.maxToolCalls){parentPort.postMessage({error:true});throw Error('Tool capability limit.');}
 const serverId=vm.getString(server),toolName=vm.getString(name),json=vm.getString(args);if(serverId.length>64||toolName.length>80||json.length>16384){parentPort.postMessage({error:true});throw Error('Tool input limit.');}const deferred=vm.newPromise(),id=ordinal++;pending.set(id,deferred);parentPort.postMessage({call:{ordinal:id,serverId,name:toolName,json}});return deferred.handle;
});vm.setProp(vm.global,'__agentosTool',call);call.dispose();
const data=JSON.stringify(JSON.stringify(input)),program=verify
 ?`(async()=>{const p=JSON.parse(${data});const value=await(async function(input,output,transcript){'use strict';\n${code}\n})(p.input,p.output,p.transcript);return JSON.stringify(value);})()`
 :`(async()=>{const input=JSON.parse(${data});const tools=Object.freeze({call:async(serverId,name,args)=>JSON.parse(await __agentosTool(String(serverId),String(name),JSON.stringify(args)))});const value=await(async function(input,tools){'use strict';\n${code}\n})(input,tools);return JSON.stringify(value);})()`;
let handle;
try{
 const result=cpu(()=>vm.evalCode(program,'agentos-plugin.js'));if(result.error){result.error.dispose();throw Error('guest');}handle=result.value;
 for(;;){if(finished)break;const state=cpu(()=>vm.getPromiseState(handle));if(state.type==='fulfilled'){try{const json=vm.getString(state.value);if(json.length>16384)throw Error('output');parentPort.postMessage({json});}finally{state.value.dispose();}break;}if(state.type==='rejected'){state.error.dispose();throw Error('guest');}if(!runtime.hasPendingJob()){await new Promise(done=>{wake=done;});continue;}const jobs=cpu(()=>runtime.executePendingJobs(1));if(jobs.error){jobs.error.dispose();throw Error('guest');}}
}catch{if(!finished)parentPort.postMessage({error:true,reason:remaining<=0?'cpu-limit':'vm-rejected'});}
finally{finished=true;parentPort.off('message',settle);for(const deferred of pending.values())if(deferred.alive)deferred.dispose();pending.clear();handle?.dispose();vm.dispose();runtime.dispose();parentPort.close();}
