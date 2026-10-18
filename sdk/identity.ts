import {encodeFunctionData,parseAbi,type Address} from 'viem';
export const identityABI=parseAbi(['function register(string agentURI) returns (uint256 agentId)','function setAgentURI(uint256 agentId,string newURI)','function getAgentWallet(uint256 agentId) view returns(address)','function ownerOf(uint256 agentId) view returns(address)','function isAuthorizedOrOwner(address spender,uint256 agentId) view returns(bool)','function tokenURI(uint256 agentId) view returns(string)','function getMetadata(uint256 agentId,string metadataKey) view returns(bytes)','function setMetadata(uint256 agentId,string metadataKey,bytes metadataValue)','event Registered(uint256 indexed agentId,string agentURI,address indexed owner)']);
export const reputationABI=parseAbi(['function getIdentityRegistry() view returns(address)','function giveFeedback(uint256 agentId,int128 value,uint8 valueDecimals,string tag1,string tag2,string endpoint,string feedbackURI,bytes32 feedbackHash)','function revokeFeedback(uint256 agentId,uint64 feedbackIndex)','function readFeedback(uint256 agentId,address clientAddress,uint64 feedbackIndex) view returns(int128 value,uint8 valueDecimals,string tag1,string tag2,bool isRevoked)','event NewFeedback(uint256 indexed agentId,address indexed clientAddress,uint64 feedbackIndex,int128 value,uint8 valueDecimals,string indexed indexedTag1,string tag1,string tag2,string endpoint,string feedbackURI,bytes32 feedbackHash)']);
/** Produces calldata only. The owner reviews/signs with their own wallet. */
export function registrationTransaction(registry:Address,agentURI:string){
 if(!/^(https:\/\/|ipfs:\/\/|data:application\/json;base64,)/.test(agentURI))throw new Error('Use a resolvable registration document URI');
 return {to:registry,data:encodeFunctionData({abi:identityABI,functionName:'register',args:[agentURI]})};
}
export function registrationDocument(input:{name:string;description:string;image:string;webEndpoint:string}){
 return {type:'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',name:input.name,description:input.description,image:input.image,services:[{name:'web',endpoint:input.webEndpoint}],active:true,x402Support:false,registrations:[],supportedTrust:[]};
}
export const registrationDataURI=(value:unknown)=>'data:application/json;base64,'+btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))));
export function completeRegistrationDocument(document:Record<string,unknown>,chainId:number,registry:Address,agentId:string){
 return {...document,registrations:[{agentId:BigInt(agentId)<=BigInt(Number.MAX_SAFE_INTEGER)?Number(agentId):agentId,agentRegistry:`eip155:${chainId}:${registry}`}]};
}
