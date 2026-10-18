import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, delimiter } from 'node:path';
import { validateConfig } from '../cre/workflow/config.ts';
const command=process.argv[2];
if(!['build','simulate'].includes(command)||process.argv.length!==3)throw new Error('Expected build or simulate.');
if(!existsSync('cre/project.yaml')||!existsSync('cre/workflow/workflow.yaml'))throw new Error('Run npm run cre:prepare first.');
if(command==='simulate')validateConfig(JSON.parse(readFileSync('cre/workflow/config.local.json','utf8')));
const localBun=resolve('.sites-runtime/cre-tools/node_modules/.bin');
const cli=process.env.AGENTOS_CRE_BIN||(existsSync('.sites-runtime/cre-bin/cre')?resolve('.sites-runtime/cre-bin/cre'):'cre');
const bunDir=process.env.AGENTOS_BUN_BIN?dirname(resolve(process.env.AGENTOS_BUN_BIN)):localBun;
mkdirSync('outputs',{recursive:true});
const args=['workflow',command,'./workflow','--project-root',resolve('cre'),'--target','staging-settings','--non-interactive',...(command==='build'?['--output',resolve('outputs/agentos-cli.wasm')]:['--trigger-index','0','--wasm',resolve('outputs/agentos-cli.wasm')])];
// Simulation is a dry run. Broadcasting requires a separate, explicit CLI command.
const child=spawn(cli,args,{cwd:resolve('cre'),env:{...process.env,PATH:[bunDir,process.env.PATH||''].join(delimiter)},stdio:'inherit'});
child.on('error',error=>{console.error(error.message+' Install CRE CLI or set AGENTOS_CRE_BIN.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
