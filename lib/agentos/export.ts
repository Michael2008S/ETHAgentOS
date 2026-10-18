import { DomainError } from './engine.ts';
import type { Workspace } from './types.ts';
import { taskContext } from './memory.ts';
import { deliveryBytes } from '../../sdk/wallet.ts';
import type { Address } from 'viem';
export type ExportKind = 'ledger' | 'artifact' | 'receipt' | 'context' | 'chain-dataset' | 'chain-artifact' | 'chain-receipts';
export function buildExport(state: Workspace, kind: ExportKind, taskId?: string, buyer?:string) {
  if (kind === 'ledger') return {body:state.ledger,filename:'agentos-ledger.json'};
  if (kind === 'chain-receipts') return {body:{version:'agentos.chain-history.v1',receipts:state.chainReceipts??[]},filename:'agentos-chain-receipts.json'};
  if (!['artifact','receipt','context','chain-dataset','chain-artifact'].includes(kind)) throw new DomainError('Unknown export format.');
  const task=state.tasks.find(t=>t.id===taskId);
  if(!task)throw new DomainError('Task not found.','NOT_FOUND');
  const filename=task.id.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100)||'agentos-task';
  if(kind==='chain-dataset'||kind==='chain-artifact'){
    if(!buyer||!/^0x[0-9a-fA-F]{40}$/.test(buyer)||/^0x0{40}$/.test(buyer))throw new DomainError('A valid buyer address is required.');
    if(!task.output)throw new DomainError('Artifact not found.','NOT_FOUND');
    const bytes=deliveryBytes(task,buyer as Address),raw=kind==='chain-dataset'?bytes.datasetText:bytes.artifactText;
    return {body:JSON.parse(raw),raw,filename:`${filename}-${kind}.json`};
  }
  if(kind==='receipt'){
    if(!task.receipt)throw new DomainError('Receipt not found.','NOT_FOUND');
    return {body:task.receipt,filename:`${filename}-receipt.json`};
  }
  if(kind==='artifact'){
    if(!task.output)throw new DomainError('Artifact not found.','NOT_FOUND');
    return {body:task.output,filename:`${filename}-output.json`};
  }
  return {body:taskContext(task,state.chainReceipts),filename:`${filename}-context.json`};
}
