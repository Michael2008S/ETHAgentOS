import { readFileSync,existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const manifest=existsSync('.sites-runtime/model/runtime.json')?JSON.parse(readFileSync('.sites-runtime/model/runtime.json','utf8')):{};
const binary=process.env.AGENTOS_LLAMA_BIN||manifest.llamaBin,model=process.env.AGENTOS_MODEL_PATH||manifest.modelPath;
if(!binary||!model)throw new Error('Run npm run model:setup or set AGENTOS_LLAMA_BIN and AGENTOS_MODEL_PATH.');
const child=spawn(resolve(binary),['--model',resolve(model),'--alias','qwen2.5-0.5b-instruct','--host','127.0.0.1','--port','11435','--ctx-size','2048','--n-gpu-layers','0','--threads','4','--parallel','1','--no-ui','--cors-origins','http://127.0.0.1:5177','--cors-methods','GET,POST','--cors-headers','Content-Type'],{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
