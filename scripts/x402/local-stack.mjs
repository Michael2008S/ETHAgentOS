import {createServer} from 'node:net';
import {createPublicClient,createWalletClient,custom,defineChain} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {startLocalChain} from '../local-chain.mjs';
import {startLocalSupplier} from '../supplier-local.mjs';
import {compile} from '../compile-contracts.mjs';
import {startFacilitator} from './facilitator.mjs';
import {startAlternateFacilitator} from './alternate-facilitator.mjs';
import {startAlternateReportService} from './alternate-report-service.mjs';
import {startReportService} from './report-service.mjs';
import {ProcurementStore} from './procurement-store.mjs';
import {x402Fulfillment} from './supplier.mjs';
import {dataFeedConfigSchema} from '../../lib/agentos/data-feeds.ts';
import {x402PolicySchema} from '../../lib/agentos/x402-policy.ts';

export async function freePort(){const server=createServer();await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});const port=server.address().port;await new Promise(ok=>server.close(ok));return port;}
/** Isolated test-token runtime. All procurement accounts are distinct from the user and Vault executor. */
export async function startX402Stack({root,appOrigin,chainPort=0,supplierPort,facilitatorPort=0,reportPort=0,authorize,afterPersist,afterPayment,implementation='reference',facilitatorOptions={},reportOptions={},feedOptions={enabled:true,riskEnabled:false}}){
 if(!['reference','alternate'].includes(implementation))throw Error('Unknown x402 implementation.');
 const startFac=implementation==='alternate'?startAlternateFacilitator:startFacilitator,startReport=implementation==='alternate'?startAlternateReportService:startReportService;
 const closers=[];try{
  const chain=await startLocalChain({port:chainPort,appOrigin,identity:true,stateDirectory:root+'/chain',authorizationToken:true});closers.push(()=>chain.close());
  const provider=chain.provider,client=createPublicClient({transport:custom(provider),cacheTime:0}),accounts=Object.values(provider.getInitialAccounts()).map(a=>privateKeyToAccount(a.secretKey)),network=defineChain({id:31337,name:'AgentOS x402 local test',nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[chain.base+'/rpc']}}}),walletFor=account=>createWalletClient({account,chain:network,transport:custom(provider)}),procurementAccount=accounts[5],facilitatorWallet=walletFor(accounts[6]),payTo=accounts[7].address,providerAccount=accounts[8],abi=compile().MockAuthorizationToken.abi;
  const store=new ProcurementStore(root+'/procurement.sqlite');closers.push(()=>store.close());
  if(!store.get('bootstrap','mint')){const hash=await walletFor(accounts[0]).writeContract({address:chain.config.token,abi,functionName:'mint',args:[procurementAccount.address,10000000n],gas:200000n});await client.waitForTransactionReceipt({hash});store.put('bootstrap','mint',{hash});}
  const facilitator=await startFac({...facilitatorOptions,client,wallet:facilitatorWallet,asset:chain.config.token,payTo,port:facilitatorPort,journalPath:root+'/facilitator.sqlite'});closers.push(()=>facilitator.close());
  const report=await startReport({...reportOptions,asset:chain.config.token,payTo,account:providerAccount,facilitatorOrigin:facilitator.base,port:reportPort,journalPath:root+'/reports.sqlite'});closers.push(()=>report.close());
  const feedSettings={enabled:feedOptions.enabled!==false,riskEnabled:feedOptions.riskEnabled??false,maxAgeSeconds:feedOptions.maxAgeSeconds??3600,depegBps:feedOptions.depegBps??200},savedFeedSettings=store.get('bootstrap','feed-settings');
  if(savedFeedSettings&&JSON.stringify(savedFeedSettings)!==JSON.stringify(feedSettings))throw Error('Persisted feed settings changed; use a separate runtime for a new policy.');
  let dataFeeds;
  if(feedOptions.enabled!==false){let feeds=store.get('bootstrap','feeds');if(!feeds){const artifacts=compile(),deploy=async(description,answer)=>{const hash=await walletFor(accounts[0]).deployContract({...artifacts.MockPriceFeed,args:[8,description,answer],gas:1500000n});const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success'||!receipt.contractAddress)throw Error('Mock feed deployment failed.');return receipt.contractAddress;};feeds={ethUsd:await deploy('ETH / USD',250000000000n),usdcUsd:await deploy('USDC / USD',100000000n)};store.put('bootstrap','feeds',feeds);}dataFeeds=dataFeedConfigSchema.parse({...feeds,maxAgeSeconds:feedOptions.maxAgeSeconds??3600,depegBps:feedOptions.depegBps??200,riskEnabled:feedOptions.riskEnabled??false});}
  if(!savedFeedSettings)store.put('bootstrap','feed-settings',feedSettings);
  const policy=x402PolicySchema.parse({version:'agentos.x402-supplier-policy.v1',upstreamOrigin:report.base,facilitatorOrigin:facilitator.base,path:'/v1/treasury-report',network:'eip155:31337',asset:chain.config.token,payTo,providerSigner:providerAccount.address,name:'DemoUSDC',domainVersion:'1',decimals:6,maxAmount:'200000',dailyAmount:'10000000',authorizationSeconds:60,maxAuthorizations:1,maxTransportRetries:3,...(dataFeeds?{dataFeeds}:{}),refundLiability:'supplier',inputDisclosure:'reviewed-input-to-configured-provider'});
  const fulfillment=await x402Fulfillment({policy,account:procurementAccount,client,store,appOrigin,authorize,afterPersist,afterPayment});
  const supplier=await startLocalSupplier({port:supplierPort??await freePort(),runtimeRoot:root+'/supplier',chainBase:chain.base,skills:['treasury-report'],supplierId:'local-x402-treasury',supplierName:'x402 Treasury Report',walletRole:'seller2',prices:{'treasury-report':100},fulfillment});closers.push(()=>supplier.close());
  return {chain,client,accounts,walletFor,procurementAccount,facilitator,report,supplier,policy,dataFeeds,store,fulfillment,close:async()=>{for(const close of closers.reverse())await close();}};
 }catch(error){for(const close of closers.reverse())try{await close();}catch{}throw error;}
}
