import { AgentWalletSession,localWalletProvider } from '../sdk/wallet.ts';
import { AgentIdentityClient } from '../sdk/agent-identity.ts';
import { encodeFunctionData,parseAbi } from 'viem';
const base=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177',chain=(process.env.AGENTOS_CHAIN_URL||'http://127.0.0.1:8545');
const config=await(await fetch(chain+'/config')).json();
const buyer=await AgentWalletSession.connect(localWalletProvider(chain),config,false);
if(BigInt((await buyer.balances()).token)<20000000n){const hash=await buyer.signer.sendTransaction({account:buyer.account,to:config.token,data:encodeFunctionData({abi:parseAbi(['function mint(address,uint256)']),functionName:'mint',args:[buyer.account,100000000n]}),gas:100000n});await buyer.client.waitForTransactionReceipt({hash});console.log('Added local test tokens only.');}
const seller=await AgentWalletSession.connect(localWalletProvider(chain,'seller'),config,false),identity=new AgentIdentityClient(seller,base);
await identity.registerAndBind('atlas');const state=(await(await fetch(base+'/api/workspace')).json()).state;
const supplierResponse=await fetch(base+'/api/suppliers');if(!supplierResponse.ok)throw new Error('Supplier not ready.');
await identity.authorizeSupplier(state.agentIdentities.find(i=>i.agentId==='atlas'),(await supplierResponse.json()).descriptor);
console.log('Atlas identity and supplier ready. Historical tasks and policies were preserved.');
