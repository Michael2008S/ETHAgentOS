import {encodeFunctionData,encodePacked,keccak256,parseAbi,sha256,stringToHex,type Address,type Hex,type PublicClient} from 'viem';

export type CREReceiverIdentity={format:'cre-v1';workflowId:Hex;workflowName:Hex;workflowOwner:Address};
export const creReceiverABI=parseAbi([
 'function supportsInterface(bytes4) view returns(bool)',
 'function configurator() view returns(address)',
 'function workflowOwner() view returns(address)',
 'function workflowName() view returns(bytes10)',
 'function workflowId() view returns(bytes32)',
 'function bindWorkflow(bytes32 id)',
 'event WorkflowBound(bytes32 indexed id)',
]);
/** CRE encodes the first ten hex characters of SHA-256 as ten ASCII bytes. */
export function creWorkflowName(name:string):Hex{
 if(!/^[a-zA-Z0-9_-]{1,64}$/.test(name))throw new Error('Use a 1–64 character CRE workflow name.');
 return stringToHex(sha256(stringToHex(name)).slice(2,12));
}
export const creIdentityHash=(name:Hex,owner:Address)=>keccak256(encodePacked(['bytes10','address'],[name,owner]));
export function validateReceiverIdentity(value:unknown):asserts value is CREReceiverIdentity{
 const v=value as CREReceiverIdentity;
 if(!v||Object.keys(v).sort().join(',')!=='format,workflowId,workflowName,workflowOwner'||v.format!=='cre-v1'||!/^0x[0-9a-f]{64}$/.test(v.workflowId)||/^0x0+$/.test(v.workflowId)||!/^0x[0-9a-f]{20}$/.test(v.workflowName)||/^0x0+$/.test(v.workflowName)||!/^0x[0-9a-fA-F]{40}$/.test(v.workflowOwner)||/^0x0+$/.test(v.workflowOwner))throw new Error('A bound CRE workflow ID, encoded name and owner are required.');
}
export function bindCREWorkflowTransaction(escrow:Address,workflowId:Hex){
 if(!/^0x[0-9a-f]{64}$/.test(workflowId)||/^0x0+$/.test(workflowId))throw new Error('A nonzero registered workflow ID is required.');
 return {to:escrow,data:encodeFunctionData({abi:creReceiverABI,functionName:'bindWorkflow',args:[workflowId]})};
}
export async function verifyCREReceiver(client:PublicClient,escrow:Address,identity:CREReceiverIdentity){
 validateReceiverIdentity(identity);
 const block=await client.getBlock(),at={address:escrow,abi:creReceiverABI,blockNumber:block.number};
 const [receiver,erc165,invalid,id,name,owner]=await Promise.all([
  client.readContract({...at,functionName:'supportsInterface',args:['0x805f2132']}),
  client.readContract({...at,functionName:'supportsInterface',args:['0x01ffc9a7']}),
  client.readContract({...at,functionName:'supportsInterface',args:['0xffffffff']}),
  client.readContract({...at,functionName:'workflowId'}),client.readContract({...at,functionName:'workflowName'}),client.readContract({...at,functionName:'workflowOwner'}),
 ]);
 if(!receiver||!erc165||invalid||id!==identity.workflowId||name!==identity.workflowName||owner.toLowerCase()!==identity.workflowOwner.toLowerCase())throw new Error('CRE receiver is unbound or differs from the configured workflow identity.');
}
