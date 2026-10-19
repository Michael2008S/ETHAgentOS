import test from 'node:test';import assert from 'node:assert/strict';import {routeHash,routeFromHash} from '../lib/agentos/navigation.ts';
test('page and task/order deep links round trip, unknown routes and legacy anchors fall back safely',()=>{
 assert.deepEqual(routeFromHash(routeHash('vault',{order:'chain-123'})),{page:'vault',order:'chain-123',task:null});assert.equal(routeFromHash('#unknown').page,'overview');assert.equal(routeFromHash('#prefunded-orders').page,'vault');assert.equal(routeFromHash(routeHash('tasks',{task:'task-a/b ?x'})).task,'task-a/b ?x');
});
