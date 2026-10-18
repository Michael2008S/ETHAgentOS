import {spawn} from 'node:child_process';
import {existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname,delimiter} from 'node:path';

const localBun=resolve('.sites-runtime/cre-tools/node_modules/.bin/bun');
const bun=process.env.AGENTOS_BUN_BIN||(existsSync(localBun)?localBun:'bun');
const env={...process.env,PATH:[...(bun!=='bun'?[dirname(bun)]:[]),process.env.PATH||''].join(delimiter)};
mkdirSync('outputs',{recursive:true});
const child=spawn(bun,[resolve('node_modules/@chainlink/cre-sdk/bin/cre-compile.ts'),resolve('cre/workflow/main.ts'),resolve('outputs/agentos-cre.wasm')],{env,stdio:'inherit'});
child.on('error',error=>{console.error('CRE build could not start: '+error.message+' Install Bun >=1.2.21 or set AGENTOS_BUN_BIN.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
