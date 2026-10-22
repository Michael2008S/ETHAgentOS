import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {createPublicClient,http,decodeEventLog} from 'viem';
import {compile} from '../compile-contracts.mjs';
import {identityABI} from '../../sdk/identity.ts';
const here=dirname(fileURLToPath(import.meta.url)),port=Number(process.env.AGENTOS_SEPOLIA_CONSOLE_PORT||6297),origin=`http://127.0.0.1:${port}`;
const directory=resolve(process.env.AGENTOS_SEPOLIA_EVIDENCE_DIR||'outputs/erc8004-sepolia-2026-10-23');await mkdir(directory,{recursive:true});
const appOrigin='http://127.0.0.1:6397',workspaceHeaders={'x-agentos-sandbox':'sepolia-11207'};
const rpc='https://ethereum-sepolia-rpc.publicnode.com',client=createPublicClient({transport:http(rpc,{timeout:20000,retryCount:1})});
const config={chainId:11155111,identityRegistry:'0x8004A818BFB912233c491871b3d84c89A494BD9e',reputationRegistry:'0x8004B663056A597Dffe9eCcC1965A193B7388713',forwarder:'0xF8344CFd5c43616a4366C34E3EEE75af79a74482',workflowName:'agentos-delivery-staging'};
const artifacts=compile(),bundle=await build({entryPoints:[here+'/main.js'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
const file=directory+'/transactions.json';let records=[];try{records=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const stringify=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x,2);
async function refresh(){for(const record of records){try{const receipt=await client.getTransactionReceipt({hash:record.hash});record.receipt=receipt;record.status=receipt.status;if(receipt.contractAddress)record.contractAddress=receipt.contractAddress;
 if(record.kind==='registration'&&receipt.status==='success'){for(const log of receipt.logs.filter(l=>l.address.toLowerCase()===config.identityRegistry.toLowerCase()))try{const event=decodeEventLog({abi:identityABI,eventName:'Registered',data:log.data,topics:log.topics});record.agentId=event.args.agentId.toString();record.owner=event.args.owner;}catch{}}
}catch(e){if(e.name!=='TransactionReceiptNotFoundError')record.checkError=e.shortMessage||e.message;}}
await writeFile(file,stringify(records));return records;}
const readMethods=new Set(['eth_chainId','eth_blockNumber','eth_call','eth_getBalance','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_getLogs','eth_estimateGas','eth_gasPrice','eth_getTransactionCount','eth_maxPriorityFeePerGas','eth_feeHistory']);
let busy=false;
const server=createServer(async(req,res)=>{const send=(status,value,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(type==='application/json'?stringify(value):value);};
try{if(req.headers.host!==`127.0.0.1:${port}`)return send(403,{error:'Host rejected'});
const url=new URL(req.url,origin);
if(req.method==='GET'){
 if(url.pathname==='/')return send(200,await readFile(here+'/index.html'),'text/html; charset=utf-8');
 if(url.pathname==='/app.js')return send(200,bundle.outputFiles[0].text,'text/javascript');
 if(url.pathname==='/api/config')return send(200,{...config,workspaceAPI:appOrigin,workspaceName:'Sepolia 11207 验收工作区'});
 if(url.pathname==='/api/workspace-state'){const r=await fetch(appOrigin+'/api/workspace',{headers:workspaceHeaders,signal:AbortSignal.timeout(20000)}),v=await r.json();return send(r.status,{scope:v.scope,revision:v.revision,identities:v.state?.agentIdentities??[],previews:v.state?.identityOrderPreviews??[],chainOrderCount:v.state?.chainOrders?.length??0});}
 if(url.pathname==='/api/artifacts')return send(200,{MockToken:artifacts.MockToken,AgentEscrowReceiver:artifacts.AgentEscrowReceiver});
 if(url.pathname==='/api/records'){if(busy)return send(409,{error:'Refresh in progress'});busy=true;try{return send(200,await refresh());}finally{busy=false;}}
}
if(req.method==='POST'){
 if(req.headers.origin!==origin||req.headers['content-type']!=='application/json')return send(403,{error:'Origin rejected'});
 let text='';for await(const chunk of req){text+=chunk;if(text.length>64000)return send(413,{error:'Too large'});}const body=JSON.parse(text);
 if(url.pathname==='/api/workspace-identity'){
 if(!['prepare','existing-challenge','bind','refresh','order-preview'].includes(body.action))return send(400,{error:'Unsupported workspace identity action'});
 const r=await fetch(appOrigin+'/api/identity',{method:'POST',headers:{...workspaceHeaders,Origin:appOrigin,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)}),v=await r.json();
 if(r.ok&&body.action==='existing-challenge')await writeFile(directory+'/workspace-challenge-'+v.challenge.nonce+'.json',stringify(v.challenge));
 if(r.ok&&body.action==='bind')await writeFile(directory+'/workspace-binding.json',stringify({scope:v.scope,revision:v.revision,identities:v.state?.agentIdentities,nonce:body.nonce,signature:body.signature,checkedAt:new Date().toISOString()}));
 if(r.ok&&body.action==='order-preview')await writeFile(directory+'/order-identity-preview.json',stringify(v));
 return send(r.status,v);
 }
 if(url.pathname==='/rpc'){if(!readMethods.has(body.method))return send(403,{error:'Read-only RPC'});if(await client.getChainId()!==11155111)throw Error('Wrong network');const value=await client.request({method:body.method,params:body.params});return send(200,{jsonrpc:'2.0',id:body.id,result:value});}
 if(url.pathname==='/api/record'){
 if(!['registration','registration-document','workspace-document','test-token','receiver','mint'].includes(body.kind)||!/^0x[0-9a-fA-F]{64}$/.test(body.hash)||Object.keys(body).sort().join(',')!=='hash,kind')return send(400,{error:'Invalid transaction record'});
 if(busy)return send(409,{error:'Refresh in progress'});busy=true;try{if(!records.some(r=>r.hash.toLowerCase()===body.hash.toLowerCase()))records.push({kind:body.kind,hash:body.hash,chainId:11155111,submittedAt:new Date().toISOString(),status:'pending',explorer:`https://sepolia.etherscan.io/tx/${body.hash}`});await writeFile(file,stringify(records));return send(200,{saved:true});}finally{busy=false;}}
}
return send(404,{error:'Not found'});
}catch(e){send(500,{error:e.shortMessage||e.message});}});
server.listen(port,'127.0.0.1',()=>console.log(`Sepolia wallet console ${origin}\nEvidence ${file}`));
