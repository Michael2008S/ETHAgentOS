import { DomainError } from './engine.ts';
import type { Workspace } from './types.ts';
export type ExportKind = 'ledger' | 'artifact' | 'receipt' | 'context';
export function buildExport(state: Workspace, kind: ExportKind, taskId?: string) {
  if (kind === 'ledger') return {body:state.ledger,filename:'agentos-ledger.json'};
  if (!['artifact','receipt','context'].includes(kind)) throw new DomainError('Unknown export format.');
  const task=state.tasks.find(t=>t.id===taskId);
  if(!task)throw new DomainError('Task not found.','NOT_FOUND');
  const filename=task.id.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100)||'agentos-task';
  if(kind==='receipt'){
    if(!task.receipt)throw new DomainError('Receipt not found.','NOT_FOUND');
    return {body:task.receipt,filename:`${filename}-receipt.json`};
  }
  if(kind==='artifact'){
    if(!task.output)throw new DomainError('Artifact not found.','NOT_FOUND');
    return {body:task.output,filename:`${filename}-output.json`};
  }
  return {body:{version:'agentos.context.v1',taskId:task.id,agentId:task.agentId,input:task.input,output:task.output,sha256:task.outputHash,events:task.events,receipt:task.receipt},filename:`${filename}-context.json`};
}
