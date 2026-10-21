import type {SupplierDescriptor} from './supplier.ts';
import type {AgentIdentity} from './identity.ts';
import type {SupplierQuoteRequest} from './supplier-quote.ts';
import type {VaultSession} from './vault.ts';
import type {Workspace} from './types.ts';

export type WorkflowSupplierBinding={supplier:SupplierDescriptor;identity:AgentIdentity};
/** Future input quotes are obtained under reviewed caps, never treated as pre-approved exact prices. */
export type WorkflowSupplierAccess={
 scope:string;
 chainTime:()=>Promise<number>;
 bind:(state:Workspace,agentId:string,supplierId:string)=>Promise<WorkflowSupplierBinding>;
 authorize:(binding:WorkflowSupplierBinding)=>Promise<void>;
 quote:(binding:WorkflowSupplierBinding,request:SupplierQuoteRequest)=>Promise<unknown>;
 checkSession:(session:VaultSession,grossCents:number)=>Promise<void>;
};
