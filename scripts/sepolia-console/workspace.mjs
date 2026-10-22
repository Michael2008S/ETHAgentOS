import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const env={...process.env,AGENTOS_DEV_STATE_DIRECTORY:resolve('.sites-runtime/sepolia-identity/db'),AGENTOS_DEV_CACHE_DIRECTORY:resolve('node_modules/.vite/sepolia-identity'),AGENTOS_IDENTITY_CONFIGURATION:JSON.stringify({rpcUrl:'https://ethereum-sepolia-rpc.publicnode.com',chainId:11155111,confirmations:2,identityRegistry:'0x8004A818BFB912233c491871b3d84c89A494BD9e',reputationRegistry:'0x8004B663056A597Dffe9eCcC1965A193B7388713'})};
async function run(args){const child=spawn(process.execPath,args,{env,stdio:'inherit'});for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));return new Promise((done,reject)=>{child.on('error',reject);child.on('close',done);});}
const initialized=await run(['scripts/db-local.mjs']);if(initialized!==0)process.exit(initialized??1);
process.exitCode=await run(['scripts/run-framework.mjs','dev','--host','127.0.0.1','--port','6397'])??1;
