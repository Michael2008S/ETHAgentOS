import test from 'node:test';
import assert from 'node:assert/strict';
import {omitFields} from '../lib/agentos/omit-fields.ts';
import {canonical,digest} from '../lib/agentos/engine.ts';

test('commitment projections exclude private and mutable metadata while preserving reviewed terms',async()=>{
 const terms={buyer:'0x1111111111111111111111111111111111111111',budget:300,input:{label:'Reviewed input'}},record=Object.freeze({...terms,digest:String('untrusted digest'),lease:{token:'private lease'},status:String('running')});
 const project=(value:typeof record)=>omitFields(value,'digest','lease','status');
 assert.equal(canonical(project(record)),canonical(terms));
 assert.equal(await digest(project({...record,status:'completed',digest:'changed',lease:{token:'changed'}})),await digest(terms));
 assert.notEqual(await digest(project({...record,budget:301})),await digest(terms));
 assert.equal(record.lease.token,'private lease');assert.equal(record.status,'running');
});

test('excluded secrets are not read and inherited or non-enumerable fields are not exported',()=>{
 const publicSymbol=Symbol('public'),secretSymbol=Symbol('secret'),record=Object.assign(Object.create({inherited:'private'}),{budget:300,[publicSymbol]:'visible',[secretSymbol]:'private'});
 Object.defineProperty(record,'secret',{enumerable:true,get(){throw Error('Secret getter must not run');}});
 Object.defineProperty(record,'hidden',{enumerable:false,value:'private'});
 const projected=omitFields(record,'secret',secretSymbol);
 assert.deepEqual(Reflect.ownKeys(projected),['budget',publicSymbol]);assert.equal(projected[publicSymbol],'visible');
});

test('projections retain an own __proto__ field as data and normalize numeric exclusion keys',()=>{
 const record=JSON.parse('{"__proto__":{"admin":true},"0":"excluded","budget":300}');
 const projected=omitFields(record,0);
 assert.equal(Object.hasOwn(projected,'0'),false);assert.equal(Object.hasOwn(projected,'__proto__'),true);
 assert.equal(Object.getPrototypeOf(projected),Object.prototype);assert.equal(projected.admin,undefined);
});
