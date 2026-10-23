import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {demoSteps,lifecycleDemos,demoInvocation} from '../scripts/demo-sequence.mjs';
test('full demo includes every historical acceptance command and excludes lifecycle operations',()=>{
 const {scripts}=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 const acceptance=Object.keys(scripts).filter(name=>name.startsWith('demo:')&&!lifecycleDemos.has(name));
 assert.deepEqual(acceptance.filter(name=>!demoSteps.includes(name)),[]);
 assert.deepEqual(demoSteps.filter(name=>!Object.hasOwn(scripts,name)||lifecycleDemos.has(name)),[]);
 assert.equal(demoSteps.at(-1),'demo:browser-business');
 assert.equal(demoSteps.filter(name=>name==='demo:doctor').length,2);
});

test('full runner supports direct Node launch without a project-local npm install',()=>{
 assert.deepEqual(demoInvocation('demo:doctor',{npmExecPath:'',node:'/bin/node'}),{command:'npm',args:['run','demo:doctor']});
 assert.deepEqual(demoInvocation('demo:showcase',{npmExecPath:'/tools/npm-cli.js',node:'/bin/node'}),{command:'/bin/node',args:['/tools/npm-cli.js','run','demo:showcase','--','--fresh']});
});
