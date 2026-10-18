import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { apiFailure } from '../lib/agentos/api-failure.ts';
import { DomainError } from '../lib/agentos/engine.ts';

test('provider failures redact nested RPC URL credentials, bodies and stack without losing retry semantics',async()=>{
  const secret='synthetic-private-key-for-redaction-test';
  const error=new Error(`RPC https://rpc.example/${secret}?api_key=${secret}\nRequest body: ${secret}`,{cause:new Error(secret)});
  for(const kind of ['runtime','chain'] as const){
    const response=apiFailure(error,kind),text=await response.text();
    assert.equal(response.status,kind==='runtime'?503:502);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.ok(!text.includes(secret));assert.ok(!text.includes('rpc.example'));assert.ok(!text.includes('Request body'));assert.match(text,/Retry/);
  }
});
test('known authorization, conflict and availability failures keep their HTTP meaning; malformed JSON stays private',async()=>{
  for(const [code,status] of [['UNAUTHORIZED',401],['FORBIDDEN',403],['NOT_FOUND',404],['CONFLICT',409],['IDEMPOTENCY_CONFLICT',409],['UNAVAILABLE',503]] as const){
    const response=apiFailure(new DomainError('Safe domain message.',code),'runtime');assert.equal(response.status,status);assert.equal(((await response.json()) as {error:string}).error,'Safe domain message.');
  }
  for(const error of [new SyntaxError('synthetic-private-body'),z.object({key:z.string()}).safeParse({key:42}).error]){
    const response=apiFailure(error,'chain');assert.equal(response.status,400);assert.equal(((await response.json()) as {error:string}).error,'Invalid JSON request.');
  }
});
