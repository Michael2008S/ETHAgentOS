import {parseModelConfiguration} from './model.ts';
import {DomainError} from './engine.ts';
import {LOCAL_WORKFLOW_MODEL} from './workflow-model-artifact.ts';
type Settings={planningConfiguration?:string;planningKey?:string;sharedConfiguration?:string;sharedKey?:string};
/** A separately configured provider never inherits another provider's credential. */
export function workflowModelSettings(settings:Settings,local:boolean){
 if(settings.planningConfiguration){let source:unknown;try{source=JSON.parse(settings.planningConfiguration);}catch{throw new DomainError('Workflow planning model configuration is unavailable.','UNAVAILABLE');}return {configuration:parseModelConfiguration(source,local),key:settings.planningKey};}
 if(local)return {configuration:parseModelConfiguration(LOCAL_WORKFLOW_MODEL,true),key:undefined};
 if(!settings.sharedConfiguration)throw new DomainError('Workflow planning model service is not configured.','UNAVAILABLE');
 let source:unknown;try{source=JSON.parse(settings.sharedConfiguration);}catch{throw new DomainError('Workflow planning model configuration is unavailable.','UNAVAILABLE');}
 if(source&&typeof source==='object'&&!Array.isArray(source))source={maxTokens:512,...source};return {configuration:parseModelConfiguration(source,false),key:settings.sharedKey};
}
