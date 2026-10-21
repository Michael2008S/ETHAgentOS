import {createServer} from 'node:http';
import {createConsumerClient,ConsumerFailure} from '../lib/agentos/consumer-client.ts';

const once=process.argv.slice(2).includes('--once');if(process.argv.slice(2).some(arg=>arg!=='--once'))throw new Error('Only --once is supported. Supply credentials through secret environment variables.');
const abort=new AbortController();for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>abort.abort());
const state={version:'agentos.consumer-health.v1',state:'starting',lastAttemptAt:null,lastSuccessAt:null,failures:0,queue:null},healthPort=process.env.AGENTOS_CONSUMER_HEALTH_PORT;
let server,interval=5000;
function health(){const age=state.lastSuccessAt?Date.now()-Date.parse(state.lastSuccessAt):Infinity,ready=state.state==='healthy'&&age<=Math.max(15000,interval*3);return {...state,ready,state:state.state==='healthy'&&!ready?'stale':state.state};}
function wait(ms){return new Promise(resolve=>{if(abort.signal.aborted)return resolve();const timer=setTimeout(done,ms);function done(){clearTimeout(timer);abort.signal.removeEventListener('abort',done);resolve();}abort.signal.addEventListener('abort',done,{once:true});});}
try{
 const client=createConsumerClient({origin:process.env.AGENTOS_CONSUMER_URL??'',token:process.env.AGENTOS_CONSUMER_TOKEN??'',gatewayBearer:process.env.AGENTOS_SITE_SERVICE_BEARER});
 if(healthPort!==undefined){const port=Number(healthPort);if(!/^\d+$/.test(healthPort)||!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid health port.');server=createServer((request,response)=>{const data=health();if(request.method!=='GET'||request.url!=='/health'||request.headers.origin||request.headers.host!=='127.0.0.1:'+server.address().port){response.writeHead(403);return response.end();}response.writeHead(data.ready?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(data));});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});console.log('Consumer health: http://127.0.0.1:'+server.address().port+'/health');}
 console.log('AgentOS authenticated consumer started.');let previous='';
 while(!abort.signal.aborted){
  state.lastAttemptAt=new Date().toISOString();
  try{
   const before=await client.status(abort.signal);interval=before.intervalMs;const counts=await client.drain(abort.signal),after=await client.status(abort.signal);state.lastSuccessAt=new Date().toISOString();state.failures=0;state.queue=after.queue;state.state=counts.failed||after.queue.dead||!['healthy','busy'].includes(after.consumer)?'degraded':'healthy';
   const summary=JSON.stringify({state:state.state,...counts});if(summary!==previous){console.log(summary);previous=summary;}
   if(once){if(state.state!=='healthy')process.exitCode=1;break;}
  }catch(error){
   if(abort.signal.aborted)break;state.failures++;state.state=error instanceof ConsumerFailure&&error.kind==='authentication'?'authentication-refused':'unavailable';const summary=JSON.stringify({state:state.state});if(summary!==previous){console.error(summary);previous=summary;}
   if(once||state.state==='authentication-refused'){process.exitCode=state.state==='authentication-refused'?2:1;break;}
  }
  await wait(state.state==='unavailable'?Math.min(60000,1000*2**Math.min(state.failures,6)):interval);
 }
}catch{console.error('Consumer configuration or health listener is unavailable.');process.exitCode=1;}
finally{state.state='stopped';if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
