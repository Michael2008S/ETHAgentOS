import {spawn} from 'node:child_process';import {resolve} from 'node:path';
const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test',...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH||resolve('.sites-runtime/playwright-browsers')}});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
