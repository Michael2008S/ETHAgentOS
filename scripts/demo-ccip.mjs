import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {runCCIPAcceptance} from './ccip/acceptance.mjs';
const directory=resolve('outputs/ccip-demo-'+crypto.randomUUID());
await mkdir(directory,{recursive:true});
const report={startedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()};
try {Object.assign(report,await runCCIPAcceptance(name=>console.log('PASS '+name)));}
catch(error){report.passed=false;report.error=error.stack;process.exitCode=1;console.error(error);}
finally {report.finishedAt=new Date().toISOString();await writeFile(directory+'/report.json',JSON.stringify(report,null,2));console.log('Evidence: '+directory+'/report.json');}
