const base=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw new Error('Local worker requires a loopback URL.');
const headers=process.env.AGENTOS_SANDBOX?{'x-agentos-sandbox':process.env.AGENTOS_SANDBOX}:{};
let stopped=false,last='';
process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
console.log(`AgentOS local recovery worker watching ${base}`);
while(!stopped){
  try {
    const response=await fetch(base+'/api/runtime',{method:'POST',headers,signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error(`Runtime HTTP ${response.status}`);
    const data=await response.json();const summary=JSON.stringify({pending:data.runtime.pending,results:data.runtime.results});
    if(summary!==last){console.log(summary);last=summary;}
  }catch(error){const message=error instanceof Error?error.message:'Worker request failed';if(message!==last){console.error(message);last=message;}}
  if(!stopped)await new Promise(resolve=>setTimeout(resolve,2000));
}
