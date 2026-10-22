import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {spawnSync} from 'node:child_process';
test('crash injection is opt-in, records its confirmed transaction and consumes its latch once',()=>{
 const root=mkdtempSync(join(tmpdir(),'agentos-crash-'));try{writeFileSync(root+'/crash-after-funding.once','armed');const source=`import {crashAfterLocalFunding} from ${JSON.stringify('file://'+resolve('scripts/local-crash-test.mjs'))};crashAfterLocalFunding(${JSON.stringify(root)},{transactionHash:'confirmed'});`;
 const invoke=enabled=>spawnSync(process.execPath,['--input-type=module','-e',source],{env:{...process.env,AGENTOS_LOCAL_CRASH_TESTS:enabled}});assert.equal(invoke('0').status,0);assert.equal(invoke('1').signal,'SIGKILL');assert.equal(JSON.parse(readFileSync(root+'/crash-after-funding.json')).transactionHash,'confirmed');assert.equal(invoke('1').status,0);
 }finally{rmSync(root,{recursive:true,force:true});}
});
