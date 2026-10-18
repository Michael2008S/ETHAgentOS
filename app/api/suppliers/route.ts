import { env } from 'cloudflare:workers';
import { owner } from '@/lib/agentos/auth';
import { serverChain } from '@/lib/agentos/chain-config';
import { configuredSupplier } from '@/lib/agentos/supplier-runtime';
import { DomainError } from '@/lib/agentos/engine';
export async function GET(request:Request){
 try{owner(request);const {client,deployment}=await serverChain(request,env.AGENTOS_CHAIN_CONFIGURATION),supplier=await configuredSupplier(request,client,deployment);return Response.json({configured:true,descriptor:supplier.descriptor},{headers:{'Cache-Control':'no-store'}});}
 catch(error){const status=error instanceof DomainError&&error.code==='UNAUTHORIZED'?401:503;return Response.json({configured:false,error:status===401?'Sign in to access your workspace.':'Skill supplier is not configured.'},{status,headers:{'Cache-Control':'no-store'}});}
}
