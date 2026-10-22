import {createServer} from 'node:http';
import {dataRpc,DataRPCError} from '../lib/agentos/chain-data.ts';
const port=Number(process.env.AGENTOS_SOURCE_PROXY_PORT),upstream=process.env.AGENTOS_SOURCE_PROXY_UPSTREAM,mode=process.env.AGENTOS_SOURCE_PROXY_MODE??'live-finalized-read',target=new URL(upstream);
if(!(target.protocol==='https:'||target.protocol==='http:'&&target.hostname==='127.0.0.1'&&target.pathname==='/captured-usdc'))throw Error('Read-only source proxy requires a fixed HTTPS RPC or local captured source.');
const endpoints=[...new Set([upstream,...(target.protocol==='https:'?JSON.parse(process.env.AGENTOS_DATA_RPC_FALLBACK_URLS??'["https://eth.drpc.org","https://ethereum.publicnode.com"]'):[])])],rpc=dataRpc(endpoints,fetch,target.protocol==='http:');let unavailable=false,requests=0,failures=0;
const server=createServer(async(req,res)=>{const send=(status,v)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(v));};
 if(req.headers.host!=='127.0.0.1:'+port||req.headers.origin)return send(403,{error:'Local server-to-server source access required.'});
 if(req.method==='GET'&&req.url==='/health')return send(200,{status:'ok',mode,unavailable,requests,failures});
 try{let text='';for await(const chunk of req){text+=chunk;if(text.length>16384)return send(413,{});}const body=JSON.parse(text||'{}');
  if(req.method==='POST'&&req.url==='/fault'&&req.headers['x-agentos-test-source']==='local-demo-fault-v1'){if(typeof body.unavailable!=='boolean'||Object.keys(body).length!==1)return send(400,{});unavailable=body.unavailable;return send(200,{unavailable});}
  if(req.method!=='POST'||!['/live-usdc','/captured-usdc'].includes(req.url))return send(404,{});requests++;if(unavailable){failures++;return send(503,{error:'Intentional isolated demo RPC outage'});}
  if(!['eth_chainId','eth_getBlockByNumber','eth_getLogs','eth_call'].includes(body.method)||body.method==='eth_call'&&body.params?.[0]?.data!=='0x313ce567')return send(403,{error:'Read-only source methods only.'});
  const result=await rpc(body.method,body.params);if(body.method==='eth_getBlockByNumber'&&body.params[0]==='finalized')rpc.pin(Number(BigInt(result.number)),result.hash);send(200,{jsonrpc:'2.0',id:body.id,result});
 }catch(error){failures++;if(error instanceof DataRPCError&&error.category==='limit')return send(200,{jsonrpc:'2.0',id:1,error:{code:-32005,message:'Data RPC response exceeds limit.'}});send(503,{error:'Upstream source unavailable'});}
});
server.listen(port,'127.0.0.1',()=>console.log('Read-only source proxy ready'));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close();server.closeAllConnections();});
