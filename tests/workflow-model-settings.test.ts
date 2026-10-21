import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowModelSettings} from '../lib/agentos/workflow-model-settings.ts';
const shared=JSON.stringify({url:'https://small.example/v1/chat/completions',model:'small-model',revision:'1'}),planning=JSON.stringify({url:'https://planner.example/v1/chat/completions',model:'planning-model',revision:'2',maxTokens:512});
test('the bundled local planner uses its pinned service without an unrelated shared provider key',()=>{
 const result=workflowModelSettings({sharedConfiguration:shared,sharedKey:'synthetic-shared-key'},true);assert.equal(result.configuration.url,'http://127.0.0.1:11436/v1/chat/completions');assert.equal(result.configuration.model,'qwen2.5-3b-instruct');assert.equal(result.key,undefined);assert.ok(!JSON.stringify(result).includes('synthetic-shared-key'));
});
test('a dedicated planning endpoint receives only its explicitly configured credential',()=>{
 assert.equal(workflowModelSettings({planningConfiguration:planning,sharedConfiguration:shared,sharedKey:'synthetic-shared-key'},true).key,undefined);const result=workflowModelSettings({planningConfiguration:planning,planningKey:'synthetic-planner-key',sharedKey:'synthetic-shared-key'},false);assert.equal(result.key,'synthetic-planner-key');assert.equal(result.configuration.url,'https://planner.example/v1/chat/completions');
});
test('hosted fallback retains the original provider and key, while missing or malformed settings fail closed',()=>{
 const result=workflowModelSettings({sharedConfiguration:shared,sharedKey:'synthetic-shared-key'},false);assert.equal(result.key,'synthetic-shared-key');assert.equal(result.configuration.model,'small-model');assert.equal(result.configuration.maxTokens,512);assert.throws(()=>workflowModelSettings({},false),/not configured/);assert.throws(()=>workflowModelSettings({planningConfiguration:'{bad',sharedConfiguration:shared},false),/configuration is unavailable/);for(const url of ['http://external.example/v1/chat/completions','https://secret@planner.example/v1/chat/completions','https://planner.example/v1/chat/completions?key=secret'])assert.throws(()=>workflowModelSettings({planningConfiguration:JSON.stringify({url,model:'bad',revision:'1'})},true));
});
