import {encodeFunctionData,parseAbi} from 'viem';
import {AgentWalletSession,localWalletProvider} from '../sdk/wallet.ts';
import {loopbackService} from '../lib/agentos/local-services.ts';
/** Test-only fixture funding. Existing balances/history and application state are retained. */
export async function prepareLocalDemoFunds(chainURL){
 const base=loopbackService(chainURL),response=await fetch(base+'/config',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Local chain configuration is unavailable.');
 const deployment=await response.json();if(deployment.mode!=='local'||deployment.chainId!==31337)throw new Error('Demo fixture funding is restricted to local chain 31337.');
 const session=await AgentWalletSession.connect(localWalletProvider(base),deployment,false),before=BigInt((await session.balances()).token),minimum=500n*10n**BigInt((await session.chain.validateDeployment()).decimals),minted=before<minimum?minimum-before:0n;
 let transactionHash;
 if(minted)transactionHash=await session.send({to:deployment.token,data:encodeFunctionData({abi:parseAbi(['function mint(address,uint256)']),functionName:'mint',args:[session.account,minted]})});
 const after=BigInt((await session.balances()).token);if(after!==before+minted)throw new Error('Local fixture token balance does not match the recorded mint.');
 return {kind:'local-mock-token-fixture',chainId:31337,token:deployment.token,buyer:session.account,before:before.toString(),minted:minted.toString(),after:after.toString(),...(transactionHash?{transactionHash}:{}),at:new Date().toISOString()};
}
