import { pathToFileURL } from 'node:url';
export async function probe(url,valid=()=>true){try{const r=await fetch(url,{signal:AbortSignal.timeout(3000)});const data=await r.json();return r.ok&&valid(data)?data:null;}catch{return null;}}
export async function doctor(){
 const [workspace,chain,model,supplier,queue]=await Promise.all([
  probe('http://127.0.0.1:5177/api/workspace',d=>!!d.scope&&Array.isArray(d.state?.tasks)),
  probe('http://127.0.0.1:8545/config',d=>d.mode==='local'&&d.chainId===31337),
  probe('http://127.0.0.1:11435/v1/models',d=>d.data?.some(m=>m.id==='qwen2.5-0.5b-instruct')),
  probe('http://127.0.0.1:7461/health',d=>d.status==='ok'),probe('http://127.0.0.1:5177/api/runtime/queue',d=>!!d.queue),
 ]);
 const services={web:!!workspace,chain:!!chain,model:!!model,supplier:!!supplier,queue:!!queue};
 const warnings=[];
 if(workspace&&chain){const identities=workspace.state.agentIdentities??[];if(!identities.length)warnings.push('No identity bound. Run npm run demo:prepare.');if(identities.some(i=>i.registry.toLowerCase()!==chain.identityRegistry.toLowerCase()))warnings.push('Saved identities belong to another local deployment. Run npm run demo:prepare; historical records remain unchanged.');}
 if(queue?.queue.dead)warnings.push('Dead queue jobs require owner retry in Runtime status.');
 return {ready:Object.values(services).every(Boolean),services,warnings,url:'http://127.0.0.1:5177'};
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){const result=await doctor();console.log(JSON.stringify(result,null,2));if(!result.ready)process.exitCode=1;}
