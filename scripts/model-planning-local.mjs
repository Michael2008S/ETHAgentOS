import {readFileSync,createReadStream} from 'node:fs';
import {stat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createConnection} from 'node:net';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {LOCAL_WORKFLOW_MODEL,WORKFLOW_MODEL_ARTIFACT} from '../lib/agentos/workflow-model-artifact.ts';
let manifest;try{manifest=JSON.parse(readFileSync('.sites-runtime/planning-model/runtime.json','utf8'));}catch{throw Error('Run npm run model:setup:planning before starting the workflow planner.');}
const occupied=await new Promise(done=>{const socket=createConnection({host:'127.0.0.1',port:11436});socket.once('connect',()=>{socket.destroy();done(true);});socket.once('error',()=>done(false));});if(occupied)throw Error('Planning port 11436 is occupied; inspect the existing service before starting another model.');
const model=resolve(process.env.AGENTOS_PLANNING_MODEL_PATH||manifest.modelPath),hash=createHash('sha256');if(manifest.artifact?.sha256!==WORKFLOW_MODEL_ARTIFACT.sha256||(await stat(model)).size!==WORKFLOW_MODEL_ARTIFACT.bytes)throw Error('Planning model manifest or size differs from the pinned artifact.');for await(const bytes of createReadStream(model))hash.update(bytes);if(hash.digest('hex')!==WORKFLOW_MODEL_ARTIFACT.sha256)throw Error('Planning model SHA-256 differs from its configured revision.');
const child=spawn(resolve(process.env.AGENTOS_LLAMA_BIN||manifest.llamaBin),['--model',model,'--alias',LOCAL_WORKFLOW_MODEL.model,'--host','127.0.0.1','--port','11436','--ctx-size','8192','--n-gpu-layers',process.env.AGENTOS_PLANNING_GPU_LAYERS??(process.platform==='darwin'?'99':'0'),'--threads','4','--parallel','1','--no-ui','--cors-origins','http://127.0.0.1:5177','--cors-methods','GET,POST','--cors-headers','Content-Type'],{stdio:'inherit'});
child.once('spawn',()=>{void writeFile('.sites-runtime/planning-model/process.json',JSON.stringify({parentPID:process.pid,childPID:child.pid,startedAt:new Date().toISOString(),alias:LOCAL_WORKFLOW_MODEL.model,revision:LOCAL_WORKFLOW_MODEL.revision,model},null,2)).catch(()=>{console.warn('Planning process metadata could not be saved.');});});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.once('error',error=>{console.error(error.message);process.exitCode=1;});child.once('exit',code=>{process.exitCode=code??1;});
