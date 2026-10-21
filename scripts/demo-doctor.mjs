import { pathToFileURL } from 'node:url';
export async function probe(url,valid=()=>true){try{const r=await fetch(url,{signal:AbortSignal.timeout(3000)});const data=await r.json();return r.ok&&valid(data)?data:null;}catch{return null;}}
export async function doctor(){
 const web=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177',chainURL=process.env.AGENTOS_CHAIN_URL||'http://127.0.0.1:8545',supplierURL=process.env.AGENTOS_SUPPLIER_URL||'http://127.0.0.1:7461';
 const [workspace,chain,model,planning,memory,supplier,queue]=await Promise.all([
  probe(web+'/api/workspace',d=>!!d.scope&&Array.isArray(d.state?.tasks)),
  probe(chainURL+'/config',d=>d.mode==='local'&&d.chainId===31337),
  probe('http://127.0.0.1:11435/v1/models',d=>d.data?.some(m=>m.id==='qwen2.5-0.5b-instruct')),
  probe('http://127.0.0.1:11436/v1/models',d=>d.data?.some(m=>m.id==='qwen2.5-3b-instruct')),
  probe('http://127.0.0.1:11437/v1/models',d=>d.data?.some(m=>m.id==='qwen3-embedding-0.6b')),
  probe(supplierURL+'/health',d=>d.status==='ok'),probe(web+'/api/runtime/queue',d=>!!d.queue),
 ]);
 const services={web:!!workspace,chain:!!chain,model:!!model,planning:!!planning,memory:!!memory,supplier:!!supplier,queue:!!queue};
 const warnings=[];if(chain&&!chain.vault)warnings.push('Local chain is an older process without AgentVault. Use npm run demo:isolated; existing history is retained.');
 if(workspace&&chain){const identities=workspace.state.agentIdentities??[];if(!identities.length)warnings.push('No identity bound. Run npm run demo:prepare.');if(identities.some(i=>i.registry.toLowerCase()!==chain.identityRegistry.toLowerCase()))warnings.push('Saved identities belong to another local deployment. Run npm run demo:prepare; historical records remain unchanged.');}
 if(queue?.queue.dead)warnings.push('Dead queue jobs require owner retry in Runtime status.');
 return {ready:Object.values(services).every(Boolean)&&!!chain?.vault,services,warnings,url:web};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await doctor();console.log(JSON.stringify(result,null,2));if(!result.ready)process.exitCode=1;}
