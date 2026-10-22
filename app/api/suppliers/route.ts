import { env } from 'cloudflare:workers';
import { owner } from '@/lib/agentos/auth';
import { serverChain } from '@/lib/agentos/chain-config';
import { configuredSupplier } from '@/lib/agentos/supplier-runtime';
import { DomainError } from '@/lib/agentos/engine';
export async function GET(request:Request){
 try{owner(request);const {client,deployment}=await serverChain(request,env.AGENTOS_CHAIN_CONFIGURATION),supplier=await configuredSupplier(request,client,deployment);return Response.json({configured:true,descriptor:supplier.descriptor,descriptors:supplier.suppliers.map(s=>s.descriptor),x402Policies:Object.fromEntries(supplier.suppliers.filter(s=>s.procurementPolicy).map(s=>[s.descriptor.id,s.procurementPolicy]))},{headers:{'Cache-Control':'no-store'}});}
 catch(error){const status=error instanceof DomainError?({UNAUTHORIZED:401,FORBIDDEN:403}[error.code]??503):503;return Response.json({configured:false,error:status===401?'Sign in to access your workspace.':status===403?'Consumer credentials cannot access owner APIs.':'Skill supplier is not configured.'},{status,headers:{'Cache-Control':'no-store'}});}
}
