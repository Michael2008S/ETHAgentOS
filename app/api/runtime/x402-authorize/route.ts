import {env} from 'cloudflare:workers';
import {read} from '@/lib/agentos/store';
import {authorizeX402} from '@/lib/agentos/x402-authority';
import {serverChain} from '@/lib/agentos/chain-config';
import {checkVaultBinding} from '@/lib/agentos/vault';
import {authorizeSupplier} from '@/lib/agentos/supplier-chain';
import {escrowABI} from '@/sdk/chain';
import {apiFailure} from '@/lib/agentos/api-failure';
import {DomainError} from '@/lib/agentos/engine';
export async function POST(request:Request){try{
 const url=new URL(request.url);
 if(!import.meta.env.DEV||url.hostname!=='127.0.0.1'||request.headers.has('origin')||request.headers.has('x-agentos-consumer-token')||request.headers.has('x-agentos-sandbox')||url.search||!env.DB)throw new DomainError('x402 procurement callbacks require the local scoped runtime.','FORBIDDEN');
 const text=await request.text();if(new TextEncoder().encode(text).length>4096)throw new DomainError('x402 authority request exceeds its bound.');
 const result=await authorizeX402({database:env.DB,read},request.headers.get('x-agentos-x402-ticket')??'',JSON.parse(text),async order=>{
  const {client,deployment}=await serverChain(request,env.AGENTOS_CHAIN_CONFIGURATION);
  if(deployment.mode!=='local'||deployment.escrow.toLowerCase()!==order.deployment.escrow.toLowerCase())throw new DomainError('x402 order deployment changed.','FORBIDDEN');
  await checkVaultBinding(client,deployment,order.vault!);await authorizeSupplier(client,deployment,order.agentIdentity!,order.supplier!);
  const task=await client.readContract({address:deployment.escrow,abi:escrowABI,functionName:'tasks',args:[order.funding!.taskId]});
  if(task[5]!==1)throw new DomainError('x402 procurement requires an active funded escrow.','FORBIDDEN');
 });
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiFailure(error,'runtime');}}
