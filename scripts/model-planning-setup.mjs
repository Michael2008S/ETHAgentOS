import {createReadStream} from 'node:fs';
import {mkdir,readFile,stat,rename,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
import {WORKFLOW_MODEL_ARTIFACT as artifact} from '../lib/agentos/workflow-model-artifact.ts';
const root=resolve('.sites-runtime/planning-model');await mkdir(root,{recursive:true});
const prior=await readFile('.sites-runtime/model/runtime.json','utf8').then(JSON.parse).catch(()=>({})),binary=process.env.AGENTOS_LLAMA_BIN||prior.llamaBin;if(!binary)throw Error('Run npm run model:setup or set AGENTOS_LLAMA_BIN to an official llama-server binary.');
async function hash(path){const h=createHash('sha256');for await(const bytes of createReadStream(path))h.update(bytes);return h.digest('hex');}
const path=join(root,artifact.filename),url='https://huggingface.co/'+artifact.repository+'/resolve/'+artifact.revision+'/'+artifact.filename+'?download=true';
let verified=false;try{verified=(await stat(path)).size===artifact.bytes&&await hash(path)===artifact.sha256;}catch{}
if(!verified){console.log('Downloading official planning artifact ('+artifact.bytes+' bytes): '+artifact.filename);await new Promise((done,reject)=>{const child=spawn('curl',['--fail','--location','--silent','--show-error','--retry','0','--connect-timeout','20','--max-time','3600','--continue-at','-','--output',path+'.part',url],{stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?done():reject(Error('Planning model download failed; partial file retained.')));});if((await stat(path+'.part')).size!==artifact.bytes||await hash(path+'.part')!==artifact.sha256)throw Error('Planning model size or SHA-256 mismatch.');await rename(path+'.part',path);}
await writeFile(join(root,'runtime.json'),JSON.stringify({llamaBin:resolve(binary),modelPath:path,artifact,url},null,2));console.log('Planning model SHA-256 verified: '+artifact.sha256);
