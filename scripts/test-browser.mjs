import {spawn} from 'node:child_process';import {resolve} from 'node:path';
import {browserRuntime} from './browser-runtime.mjs';
const args=process.argv.slice(2),manage=args.includes('--manage-models');
const runtime=await browserRuntime(args.filter(a=>a!=='--manage-models'));
if(manage)process.env.AGENTOS_BROWSER_MANAGE_MODELS='1';
const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test',...runtime.args],{stdio:'inherit',env:{...process.env,...runtime.environment,PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH||resolve('.sites-runtime/playwright-browsers')}});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
