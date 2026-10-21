import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {Miniflare} from 'miniflare';
import {build} from 'esbuild';

/** Disposable synthetic-evidence fixture, never the AgentOS workspace or wallet RPC. */
export async function temporaryEvidence(escrow,root){
 const executable=process.env.AGENTOS_CLOUDFLARED_BIN||(existsSync('.sites-runtime/cre-tools/cloudflared/cloudflared')?resolve('.sites-runtime/cre-tools/cloudflared/cloudflared'):'cloudflared'),token=randomBytes(32).toString('hex');
 let worker,tunnel,origin,log='',closed=false,terminal=false;
 const server=createServer(async(request,response)=>{try{
  if(!worker){response.writeHead(503);response.end('Fixture preparing');return;}
  const chunks=[];let size=0;for await(const chunk of request){if((size+=chunk.length)>131072){response.writeHead(413);response.end();return;}chunks.push(chunk);}
  const upstream=await worker.dispatchFetch(origin+request.url,{method:request.method,headers:request.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
  response.writeHead(upstream.status,Object.fromEntries(upstream.headers));response.end(Buffer.from(await upstream.arrayBuffer()));
 }catch{response.writeHead(503);response.end('Fixture unavailable');}});
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
 async function close(){if(closed)return;closed=true;if(tunnel&&!terminal){tunnel.kill('SIGTERM');await Promise.race([new Promise(done=>tunnel.once('exit',done)),new Promise(done=>setTimeout(done,3000))]);if(!terminal)tunnel.kill('SIGKILL');}if(worker)await worker.dispose();server.closeAllConnections();await new Promise(done=>server.close(done));await mkdir(root,{recursive:true});await writeFile(root+'/tunnel.log',log);}
 try{
  tunnel=spawn(executable,['tunnel','--no-autoupdate','--protocol','http2','--url','http://127.0.0.1:'+server.address().port],{stdio:['ignore','pipe','pipe']});
  tunnel.once('error',error=>{terminal=true;log+='Tunnel error: '+error.message;});tunnel.once('exit',()=>{terminal=true;});
  for(const stream of [tunnel.stdout,tunnel.stderr])stream.on('data',chunk=>{log+=chunk.toString();origin??=log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];});
  const deadline=Date.now()+90000;while(!origin){if(terminal||Date.now()>deadline)throw new Error('Temporary HTTPS fixture did not become available; inspect tunnel.log.');await new Promise(done=>setTimeout(done,250));}
  const bundle=await build({entryPoints:['services/evidence/worker.ts'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});
  worker=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',r2Buckets:['BUCKET'],r2Persist:root+'/r2',bindings:{PUBLIC_ORIGIN:origin,ESCROW_ADDRESS:escrow,WRITE_TOKEN:token},host:'127.0.0.1',port:0});
  for(;;){if(terminal||Date.now()>deadline)throw new Error('Temporary HTTPS fixture is not reachable; inspect tunnel.log.');try{const response=await fetch(origin+'/v1/config',{signal:AbortSignal.timeout(5000)}),config=await response.json();if(response.ok&&config.escrow===escrow.toLowerCase())break;}catch{}await new Promise(done=>setTimeout(done,500));}
  console.log('Temporary synthetic HTTPS evidence ready: '+origin);
  return {origin,token,close};
 }catch(error){await close();throw error;}
}
