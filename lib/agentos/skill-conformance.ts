import {assertSkillDefinition,skillDefinitionHash,type RankedFlowInput,type SkillDefinition} from './skill-definition.ts';
import {recomputeRankedFlows} from '../../cre/workflow/ranked-flows.ts';

export const SKILL_CONFORMANCE_INPUTS:RankedFlowInput[]=[
 {dataset:'custom-transfers-v1',blockFrom:10,blockTo:20,records:[{block:9,from:'ignored',to:'ignored',cents:9999},{block:10,from:'treasury-a',to:'alice',cents:101},{block:11,from:'treasury-a',to:'bob',cents:100},{block:20,from:'treasury-b',to:'bob',cents:1},{block:21,from:'ignored',to:'ignored',cents:9999}]},
 {dataset:'custom-transfers-v1',blockFrom:0,blockTo:0,records:[]},
 {dataset:'custom-transfers-v1',blockFrom:0,blockTo:0,records:[{block:0,from:'zero',to:'zero',cents:0}]},
 {dataset:'custom-transfers-v1',blockFrom:0,blockTo:1,records:[{block:0,from:'one',to:'large',cents:Number.MAX_SAFE_INTEGER-1},{block:1,from:'two',to:'small',cents:1}]},
];
function normalized(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(normalized).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+normalized(v)).join(',')+'}';
 return JSON.stringify(value);
}
/** Developer conformance, not authorization or proof of remote behavior. */
export async function checkSkillConformance(definition:SkillDefinition,execute:(definition:SkillDefinition,input:RankedFlowInput)=>unknown|Promise<unknown>){
 assertSkillDefinition(definition);
 for(const [index,input] of SKILL_CONFORMANCE_INPUTS.entries()){
  const actual=await execute(structuredClone(definition),structuredClone(input)),expected=recomputeRankedFlows(definition,input);
  if(normalized(actual)!==normalized(expected))throw new Error('Provider failed skill conformance case '+(index+1)+'.');
 }
 return {version:'agentos.skill-conformance.v1',skillId:definition.id,definitionHash:skillDefinitionHash(definition),cases:SKILL_CONFORMANCE_INPUTS.length,passed:true,scope:'local developer computation only; no identity, funding, signature, remote execution or settlement acceptance'};
}
