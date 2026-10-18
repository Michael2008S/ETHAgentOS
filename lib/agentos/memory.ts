import { DomainError } from './engine.ts';
import type { Task, TaskStatus, Workspace } from './types.ts';
import type { SavedChainReceipt } from './chain-reconciliation.ts';

export type MemoryQuery = { q: string; agentId: string; status: TaskStatus | ''; artifactsOnly: boolean; offset: number; limit: number };
export const TASK_STATUSES: TaskStatus[] = ['queued','running','paused','completed','blocked','refunded','cancelled','expired'];
export function parseMemoryQuery(params: URLSearchParams): MemoryQuery {
  const q=(params.get('q')??'').trim(), agentId=params.get('agentId')??'', status=params.get('status')??'', artifacts=params.get('artifactsOnly')??'false';
  const offset=Number(params.get('offset')??0),limit=Number(params.get('limit')??20);
  if (q.length>200 || agentId.length>128 || status && !TASK_STATUSES.includes(status as TaskStatus) || !['true','false'].includes(artifacts) || !Number.isSafeInteger(offset) || offset<0 || offset>300 || !Number.isSafeInteger(limit) || limit<1 || limit>50) throw new DomainError('Invalid memory search filters.');
  return {q,agentId,status:status as TaskStatus|'',artifactsOnly:artifacts==='true',offset,limit};
}
function matchingTasks(state: Workspace, query: MemoryQuery): Task[] {
  const needle=query.q.toLocaleLowerCase();
  return state.tasks.filter(task => {
    if(query.agentId && task.agentId!==query.agentId || query.status && task.status!==query.status || query.artifactsOnly && !task.output)return false;
    if(!needle)return true;
    const agent=state.agents.find(a=>a.id===task.agentId);
    return JSON.stringify([task.id,task.title,task.agentId,agent?.name,task.skill,task.input,task.inputHash,task.output,task.outputHash,task.receipt?.digest,task.events.map(e=>[e.title,e.detail]),state.chainReceipts?.filter(r=>r.webTaskId===task.id)]).toLocaleLowerCase().includes(needle);
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
}
export function queryMemory(state: Workspace, query: MemoryQuery) {
  const matches=matchingTasks(state,query);
  return {items:matches.slice(query.offset,query.offset+query.limit),total:matches.length,offset:query.offset,limit:query.limit};
}
export function taskContext(task: Task,receipts:SavedChainReceipt[]=[]) {
  return {version:'agentos.context.v1',taskId:task.id,title:task.title,agentId:task.agentId,skill:task.skill,status:task.status,createdAt:task.createdAt,deadlineAt:task.deadlineAt,input:task.input,inputHash:task.inputHash??task.receipt?.inputHash,output:task.output,sha256:task.outputHash,events:task.events,receipt:task.receipt,chainReceipts:receipts.filter(r=>r.webTaskId===task.id)};
}
export function exportMemory(state: Workspace, query: MemoryQuery) {
  const tasks=matchingTasks(state,query);
  return {version:'agentos.memory.v1',filters:{q:query.q,agentId:query.agentId,status:query.status,artifactsOnly:query.artifactsOnly},total:tasks.length,items:tasks.map(task=>taskContext(task,state.chainReceipts))};
}
