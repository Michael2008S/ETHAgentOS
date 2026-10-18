import { createReadStream } from 'node:fs';
import { mkdir,readFile,rename,stat,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve,join } from 'node:path';
const root=resolve('.sites-runtime/model');
if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Automatic setup supports macOS arm64. Install an official llama-server and set AGENTOS_LLAMA_BIN on another platform.');
const sources=[
 {name:'llama-b11669-bin-macos-arm64.tar.gz',url:'https://github.com/ggml-org/llama.cpp/releases/download/b11669/llama-b11669-bin-macos-arm64.tar.gz',sha256:'dbed55493d72bc1ba2babc8770d669c2289b5bc4ee9fb2a4dfc158d45b7d13fd'},
 {name:'qwen2.5-0.5b-instruct-q4_k_m.gguf',url:'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/9217f5db79a29953eb74d5343926648285ec7e67/qwen2.5-0.5b-instruct-q4_k_m.gguf?download=true',sha256:'74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db'},
];
async function command(cmd,args,capture=false){return new Promise((done,reject)=>{const p=spawn(cmd,args,{stdio:capture?['ignore','pipe','inherit']:'inherit'});let out='';p.stdout?.on('data',b=>out+=b);p.on('error',reject);p.on('close',code=>code===0?done(out):reject(new Error(cmd+' exited '+code)));});}
async function hash(path){const result=createHash('sha256');for await(const chunk of createReadStream(path))result.update(chunk);return result.digest('hex');}
await mkdir(root,{recursive:true});
for(const source of sources){
 const path=join(root,source.name);if(await stat(path).then(()=>true,()=>false)&&await hash(path)===source.sha256){console.log('Verified existing '+source.name);continue;}
 console.log('Downloading official artifact: '+source.name);
 await command('curl',['--fail','--location','--silent','--show-error','--retry','2','--connect-timeout','20','--max-time','900','--continue-at','-','--output',path+'.part',source.url]);
 if(await hash(path+'.part')!==source.sha256)throw new Error('SHA-256 mismatch for '+source.name);await rename(path+'.part',path);console.log('SHA-256 verified: '+source.name);
}
const archive=join(root,sources[0].name),list=await command('tar',['-tzf',archive],true);if(list.split('\n').some(p=>p.startsWith('/')||p.split('/').includes('..')))throw new Error('Unsafe archive path.');
await command('tar',['-xzf',archive,'-C',root]);
const relative=list.split('\n').find(p=>p.endsWith('/llama-server')||p==='llama-server');if(!relative)throw new Error('Official server binary not found.');
await writeFile(join(root,'runtime.json'),JSON.stringify({llamaBin:join(root,relative),modelPath:join(root,sources[1].name),runtimeVersion:'b11669',modelRevision:'9217f5db79a29953eb74d5343926648285ec7e67',sources},null,2));console.log('Local model setup ready. No credentials were created.');
