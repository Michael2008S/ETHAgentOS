import {DomainError} from './engine.ts';
import type {Skill} from './types.ts';
import type {WorkflowCondition} from './workflow-state.ts';

export function validateWorkflowCondition(when:WorkflowCondition,skills:(Skill|undefined)[],index:number){
 const skill=skills[when.step];
 if(when.step>=index||!skill||when.field==='concentrated'&&(typeof when.value!=='boolean'||when.operator!=='eq'||!skill.startsWith('ext:'))||when.field!=='concentrated'&&typeof when.value!=='number'||when.field==='accountCount'&&!skill.startsWith('ext:')||when.field==='uniqueRecipients'&&skill!=='event-analysis')throw new DomainError('Workflow condition must reference a supported field of an earlier accepted step.');
}
