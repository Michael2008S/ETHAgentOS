import {DomainError} from './engine.ts';
import {findMixed} from './mixed-workflow.ts';
import type {Workspace} from './types.ts';
/** The same forward lineage defines renewal fences, receipts and workbench totals. */
export function mixedSuccessors(state:Workspace,id:string){
 const rows:ReturnType<typeof findMixed>[]=[],seen=new Set<string>();let flow=findMixed(state,id);
 for(;;){if(seen.has(flow.id)||rows.length>=20)throw new DomainError('Invalid or excessive mixed repair lineage.','CONFLICT');seen.add(flow.id);rows.push(flow);if(!flow.repairedBy)return rows;const next=findMixed(state,flow.repairedBy);if(next.repair?.sourceId!==flow.id||next.buyer.toLowerCase()!==flow.buyer.toLowerCase())throw new DomainError('Mixed repair lineage changed.','CONFLICT');flow=next;}
}
