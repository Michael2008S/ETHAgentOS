import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {checkSkillConformance} from '../lib/agentos/skill-conformance.ts';

const args=process.argv.slice(2);
if(args.length!==4||args[0]!=='--definition'||args[2]!=='--provider')throw new Error('Usage: npm run skill:conformance -- --definition manifest.json --provider trusted-local-module.mjs');
// Explicit developer-selected source executes with the caller's OS privileges.
// The AgentOS server does not import arbitrary modules named by manifests.
const definition=JSON.parse(await readFile(resolve(args[1]),'utf8')),provider=await import(pathToFileURL(resolve(args[3])).href);
if(typeof provider.execute!=='function')throw new Error('Provider must export execute(definition, input).');
const timer=setTimeout(()=>{console.error('Provider conformance timed out.');process.exit(1);},15000);
try{console.log(JSON.stringify(await checkSkillConformance(definition,provider.execute),null,2));}finally{clearTimeout(timer);}
