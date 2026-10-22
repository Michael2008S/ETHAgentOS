import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,defineChain} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {compile} from '../scripts/compile-contracts.mjs';
import {startFacilitator} from '../scripts/x402/facilitator.mjs';
import {startReportService} from '../scripts/x402/report-service.mjs';
import {x402PolicySchema} from '../lib/agentos/x402-policy.ts';
import {digest} from '../lib/agentos/engine.ts';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';

export async function x402Fixture(){
 const root=await mkdtemp(join(tmpdir(),'agentos-x402-')),provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',chainId:31337}}),client=createPublicClient({transport:custom(provider),cacheTime:0}),chain=defineChain({id:31337,name:'AgentOS local x402 acceptance',nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['http://127.0.0.1']}}}),accounts=Object.values(provider.getInitialAccounts()).map(a=>privateKeyToAccount(a.secretKey)),walletFor=account=>createWalletClient({account,chain,transport:custom(provider)}),wallet=walletFor(accounts[0]),contracts=compile();
 const deploy=async(name,args=[])=>(await client.waitForTransactionReceipt({hash:await wallet.deployContract({...contracts[name],args,gas:6000000n})})).contractAddress;
 const token=await deploy('MockAuthorizationToken');const write=async(address,abi,functionName,args=[],signer=wallet)=>{const hash=await signer.writeContract({address,abi,functionName,args,gas:6000000n});if((await client.waitForTransactionReceipt({hash})).status!=='success')throw Error('Local fixture transaction reverted.');return hash;};
 await write(token,contracts.MockAuthorizationToken.abi,'mint',[accounts[1].address,10000000n]);
 const fac=await startFacilitator({client,wallet:walletFor(accounts[2]),asset:token,payTo:accounts[3].address,journalPath:root+'/facilitator.sqlite'});
 const serverOptions={asset:token,payTo:accounts[3].address,account:accounts[4],facilitatorOrigin:fac.base,journalPath:root+'/reports.sqlite'};
 const report=await startReportService(serverOptions);
 const policy=x402PolicySchema.parse({version:'agentos.x402-supplier-policy.v1',upstreamOrigin:report.base,facilitatorOrigin:fac.base,path:'/v1/treasury-report',network:'eip155:31337',asset:token,payTo:accounts[3].address,providerSigner:accounts[4].address,name:'DemoUSDC',domainVersion:'1',decimals:6,maxAmount:'200000',dailyAmount:'10000000',authorizationSeconds:60,maxAuthorizations:1,maxTransportRetries:3,refundLiability:'supplier',inputDisclosure:'reviewed-input-to-configured-provider'});
 const input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:1,from:'treasury',to:'alice',cents:125},{block:2,from:'treasury',to:'bob',cents:75}]};
 const request={version:'agentos.x402-report-request.v1',jobId:await digest({fixture:crypto.randomUUID()}),inputHash:await digest(input),input};
 return {root,provider,client,wallet,walletFor,accounts,contracts,token,deploy,write,fac,report,policy,request,serverOptions,close:async()=>{await report.close();await fac.close();await provider.disconnect();await rm(root,{recursive:true,force:true});}};
}
