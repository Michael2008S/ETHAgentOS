import test from 'node:test';
import assert from 'node:assert/strict';
import { submissionIntent } from '../lib/agentos/client-intent.ts';
test('lost response retries original intent, acknowledgement permits a new purchase, scopes isolate users and wallets',async()=>{
  const data=new Map<string,string>(),storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};
  const effects=new Set<string>();let lost=true;
  async function submit(){const intent=await submissionIntent('owner-a','task',{title:'report',budget:1000},storage);effects.add(intent.id);if(lost){lost=false;throw new Error('response lost after commit');}intent.acknowledge();return intent.id;}
  await assert.rejects(submit(),/lost/);const original=await submit();assert.equal(effects.size,1);
  assert.notEqual(await submit(),original);assert.equal(effects.size,2);
  const a=await submissionIntent('a','order',{buyer:'wallet-a',title:'x'},storage);
  assert.equal((await submissionIntent('a','order',{title:'x',buyer:'wallet-a'},storage)).id,a.id);
  assert.notEqual((await submissionIntent('b','order',{buyer:'wallet-a',title:'x'},storage)).id,a.id);
  assert.notEqual((await submissionIntent('a','order',{buyer:'wallet-b',title:'x'},storage)).id,a.id);
});
