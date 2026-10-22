import {canonical} from '../../cre/workflow/verify.ts';
import {digest,DomainError,resolveSkillInput} from './engine.ts';
import type {AgentIdentity} from './identity.ts';
import type {Workspace,TaskInput} from './types.ts';
export type IdentityOrderPreview={id:string;requestId:string;status:'identity-preview';fundingEnabled:false;title:string;agentId:string;buyer:`0x${string}`;budget:number;quote:number;skill:string;input:TaskInput;agentIdentity:AgentIdentity;workspaceHash:string;commitment:string;createdAt:string};
/** Unfunded intent only: no escrow, authorization, queue job or payment is created. */
export async function previewIdentityOrder(state:Workspace,scope:string,input:{requestId:string;agentId:string;title:string;budget:number;buyer:`0x${string}`},identity:AgentIdentity){
 const agent=state.agents.find(a=>a.id===input.agentId),bound=state.agentIdentities?.find(i=>i.agentId===input.agentId);
 if(!agent?.enabled||!bound||bound.status!=='verified'||identity.status!=='verified'||canonical({...bound,checkedAt:'',checkedBlock:'',checkedBlockHash:''})!==canonical({...identity,checkedAt:'',checkedBlock:'',checkedBlockHash:''}))throw new DomainError('A current workspace-bound identity is required.','CONFLICT');
 if(!Number.isInteger(input.budget)||input.budget<agent.price||input.budget>1000000)throw new DomainError('Budget does not cover the current quote.');
 const parameters={...input,quote:agent.price,skill:agent.skill,input:resolveSkillInput(state,agent.skill),agentIdentity:structuredClone(bound),workspaceHash:scope};
 const prior=state.identityOrderPreviews?.find(p=>p.requestId===input.requestId);
 if(prior){const {id:_,status:__,fundingEnabled:___,commitment:____,createdAt:_____,...old}=prior;if(canonical(old)!==canonical(parameters))throw new DomainError('Preview request was already used with different parameters.','IDEMPOTENCY_CONFLICT');return state;}
 if((state.identityOrderPreviews?.length??0)>=50)throw new DomainError('Identity preview limit reached.');
 const preview:IdentityOrderPreview={...parameters,id:'identity-preview-'+input.requestId,status:'identity-preview',fundingEnabled:false,commitment:await digest({version:'agentos.identity-order-preview.v1',...parameters}),createdAt:new Date().toISOString()};
 return {...state,identityOrderPreviews:[...(state.identityOrderPreviews??[]),preview]};
}
