import test from 'node:test';
import assert from 'node:assert/strict';
import { owner, checkOrigin } from '../lib/agentos/auth.ts';
test('sandbox namespaces isolate test data without changing the trusted gateway identity', () => {
  const request = (name: string) => new Request('http://127.0.0.1:5177/api/workspace', {headers: {'oai-authenticated-user-id': 'gateway-user', 'x-agentos-sandbox': name}});
  assert.equal(owner(request('suite-a')), 'gateway-user:sandbox:suite-a');
  assert.notEqual(owner(request('suite-a')), owner(request('suite-b')));
  assert.equal(owner(new Request('http://localhost/api/workspace')), 'local-demo');
  assert.throws(() => owner(request('bad/namespace')), /Invalid/);
});
test('hosted API rejects unsigned access and local test overrides', () => {
  assert.throws(() => owner(new Request('https://demo.example/api/workspace')), /Sign in/);
  assert.equal(owner(new Request('https://demo.example/api/workspace', {headers: {'oai-authenticated-user-id': 'owner'}})), 'owner');
  assert.throws(() => owner(new Request('https://demo.example/api/workspace', {headers: {'oai-authenticated-user-id': 'owner', 'x-agentos-sandbox': 'test'}})), /loopback/);
});
test('writes require a matching origin when an origin is provided', () => {
  checkOrigin(new Request('http://localhost/api/command', {headers: {origin:'http://localhost'}}));
  assert.throws(() => checkOrigin(new Request('http://localhost/api/command', {headers: {origin:'https://other.example'}})), /Cross-origin/);
});
