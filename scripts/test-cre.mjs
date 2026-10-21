import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
const local=resolve('.sites-runtime/cre-tools/node_modules/.bin/bun'),bun=process.env.AGENTOS_BUN_BIN||(existsSync(local)?local:'bun');
const child=spawn(bun,['test','cre/tests',...process.argv.slice(2)],{stdio:'inherit',env:process.env});
child.once('error',error=>{console.error('CRE runtime tests need Bun: '+error.message);process.exitCode=1;});child.once('exit',code=>{process.exitCode=code??1;});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
