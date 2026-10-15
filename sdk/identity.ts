import {encodeFunctionData,parseAbi,type Address} from 'viem';
export const identityABI=parseAbi(['function register(string agentURI) returns (uint256 agentId)','function setAgentURI(uint256 agentId,string newURI)','function getAgentWallet(uint256 agentId) view returns(address)']);
/** Produces calldata only. The owner reviews/signs with their own wallet. */
export function registrationTransaction(registry:Address,agentURI:string){
 if(!/^(https:\/\/|ipfs:\/\/|data:application\/json;base64,)/.test(agentURI))throw new Error('Use a resolvable registration document URI');
 return {to:registry,data:encodeFunctionData({abi:identityABI,functionName:'register',args:[agentURI]})};
}
export function registrationDocument(input:{name:string;description:string;image:string;webEndpoint:string}){
 return {type:'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',name:input.name,description:input.description,image:input.image,services:[{name:'web',endpoint:input.webEndpoint}],active:true,x402Support:false,registrations:[],supportedTrust:[]};
}
