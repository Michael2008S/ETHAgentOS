import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,lstat,chmod,symlink,writeFile,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {digest} from '../lib/agentos/engine.ts';import {textPluginExample,vaultPluginExample} from '../lib/agentos/plugin-examples.ts';
import {pluginManifestHash,pluginAttestationMessage,pluginExecutionTerms} from '../lib/agentos/plugin-protocol.ts';
import {executePlugin} from '../scripts/plugins/sandbox.mjs';import {verifyPluginForSettlement} from '../scripts/plugins/settlement-verifier.mjs';
import {pluginDeliverySigner} from '../scripts/plugins/delivery-signer.mjs';import {startPluginService} from '../scripts/plugins/service.mjs';import {createMcpFixture} from '../scripts/plugins/mcp-fixture.mjs';
const signer=()=>privateKeyToAccount(generatePrivateKey());
async function fixture(manifest=textPluginExample()){
 const account=signer(),terms={protocol:'agentos.plugin-runtime.v1',engine:'quickjs-emscripten@0.32.0',revision:'unit',origin:'http://127.0.0.1:1',appOrigin:'http://127.0.0.1:2',deliverySigner:account.address,tools:[]},runtime={...terms,configHash:await digest(terms)},input={labels:['Research',' research ','OPS']},request={jobId:'plugin-job-'+crypto.randomUUID(),scope:await digest('owner'),manifest,manifestHash:await pluginManifestHash(manifest),input,inputHash:await digest(input),runtimeHash:runtime.configHash};
 return {account,runtime,request};
}
async function signed(account,execution){const value=structuredClone(execution);value.digest=await digest(pluginExecutionTerms(value));value.attestation={version:'agentos.plugin-attestation.v1',signer:account.address,signature:await account.signMessage({message:pluginAttestationMessage(value)})};return value;}
test('paid acceptance requires the committed runtime signature and independently reproduces arbitrary JSON output',async()=>{
 const {account,runtime,request}=await fixture(),execution=await executePlugin(request,async()=>{throw Error('No tools');}),receipt=await signed(account,execution);
 assert.equal((await verifyPluginForSettlement(request,receipt,runtime)).accepted,true);
 await assert.rejects(verifyPluginForSettlement(request,execution,runtime),/signature/);
 const changed=structuredClone(receipt);changed.output.count=3;changed.digest=await digest(pluginExecutionTerms(changed));await assert.rejects(verifyPluginForSettlement(request,changed,runtime),/signature/);
 const foreign=await signed(signer(),execution);await assert.rejects(verifyPluginForSettlement(request,foreign,runtime),/signature/);
 const malleable=structuredClone(receipt);malleable.attestation.uncommitted='extra bytes';await assert.rejects(verifyPluginForSettlement(request,malleable,runtime),/signature|shape/);
 for(const field of ['scope','jobId','inputHash']){const modified=structuredClone(receipt);modified[field]=field==='jobId'?'plugin-job-'+crypto.randomUUID():await digest('another');await assert.rejects(verifyPluginForSettlement(request,await signed(account,modified),runtime),/reviewed request/);}
 const alternate={...runtime,deliverySigner:foreign.attestation.signer};alternate.configHash=await digest(Object.fromEntries(Object.entries(alternate).filter(([key])=>key!=='configHash')));await assert.rejects(verifyPluginForSettlement(request,foreign,alternate),/commitment/);
});
test('even a valid provider signature and permissive checker cannot settle output different from the committed code',async()=>{
 const manifest={...textPluginExample(),verifier:'return true;'},f=await fixture(manifest),execution=await executePlugin(f.request,async()=>{});execution.output={labels:['invented'],count:1};
 await assert.rejects(verifyPluginForSettlement(f.request,await signed(f.account,execution),f.runtime),/independent replay/);
});
test('paid full-artifact hashes require canonical signature bytes and signer spelling, including rejection of a cryptographically valid high-S alternative',async()=>{
 const {account,runtime,request}=await fixture(),execution=await executePlugin(request,async()=>{}),receipt=await signed(account,execution),n=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,sig=receipt.attestation.signature,highS=sig.slice(0,66)+(n-BigInt('0x'+sig.slice(66,130))).toString(16).padStart(64,'0')+(sig.endsWith('1b')?'1c':'1b');
 const {verifyMessage}=await import('viem');assert.equal(await verifyMessage({address:account.address,message:pluginAttestationMessage(receipt),signature:highS}),true,'the test must exercise actual ECDSA malleability');
 const variants=[{...receipt.attestation,signature:highS},{...receipt.attestation,signature:'0x'+sig.slice(2).toUpperCase()},{...receipt.attestation,signature:sig.slice(0,-2)+(sig.endsWith('1b')?'00':'01')}];if(account.address!==account.address.toLowerCase())variants.push({...receipt.attestation,signer:account.address.toLowerCase()});
 for(const attestation of variants)await assert.rejects(verifyPluginForSettlement(request,{...receipt,attestation},runtime),/signature/);
});
test('delivery keys survive concurrent creation, refuse permissive files and symlinks, and are not replaced on corruption',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'agentos-plugin-key-'));try{const accounts=await Promise.all(Array.from({length:4},()=>pluginDeliverySigner(directory)));assert.equal(new Set(accounts.map(a=>a.address)).size,1);const file=join(directory,'.delivery-signer.key');assert.equal((await lstat(file)).mode&0o777,0o600);await chmod(file,0o644);await assert.rejects(pluginDeliverySigner(directory),/private regular/);await chmod(file,0o600);await writeFile(file,'broken');await assert.rejects(pluginDeliverySigner(directory),/invalid/);assert.equal(await readFile(file,'utf8'),'broken');await rm(file);await writeFile(join(directory,'target'),'unrelated');await symlink(join(directory,'target'),file);await assert.rejects(pluginDeliverySigner(directory),/private regular/);assert.equal(await readFile(join(directory,'target'),'utf8'),'unrelated');}finally{await rm(directory,{recursive:true,force:true});}
});
test('actual MCP service signs a committed transcript; key and signed journal persist through restart',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'agentos-plugin-signature-')),mcp=await createMcpFixture({port:0,snapshotProvider:async()=>({chainId:31337,vault:'0x'+'a'.repeat(40),owner:'0x'+'b'.repeat(40),balanceBaseUnits:'500',decimals:6,blockNumber:'42'})}),servers=[{id:'local-chain',url:mcp.url,revision:'1',readTools:['vault_snapshot']}];let service;
 try{service=await startPluginService({port:0,servers,directory,authorize:async()=>true});const runtime=await service.descriptor(),manifest=vaultPluginExample(runtime),input={targetBaseUnits:'700'},request={jobId:'plugin-job-'+crypto.randomUUID(),scope:await digest('owner'),manifest,manifestHash:await pluginManifestHash(manifest),input,inputHash:await digest(input),runtimeHash:runtime.configHash},capability={jobId:request.jobId,scope:request.scope,token:'a'.repeat(64),requestHash:await digest({jobId:request.jobId,scope:request.scope,manifestHash:request.manifestHash,inputHash:request.inputHash,runtimeHash:request.runtimeHash})};
  const post=async()=>{const r=await fetch(service.origin+'/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request,capability})});assert.equal(r.status,200);return (await r.json()).execution;},first=await post();assert.equal(first.attestation.signer,runtime.deliverySigner);assert.equal((await verifyPluginForSettlement(request,first,runtime)).accepted,true);assert.equal(mcp.stats.calls,1,'independent replay must not invoke live MCP again');
  const key=await pluginDeliverySigner(directory),wrong=structuredClone(first);wrong.transcript[0].arguments={invented:true};await assert.rejects(verifyPluginForSettlement(request,await signed(key,wrong),runtime),/replay/);
  const port=Number(new URL(service.origin).port);await service.close();service=await startPluginService({port,servers,directory,authorize:async()=>true});assert.deepEqual(await service.descriptor(),runtime);assert.deepEqual(await post(),first);assert.equal(mcp.stats.calls,1);
 }finally{await service?.close();await mcp.close();await rm(directory,{recursive:true,force:true});}
});
