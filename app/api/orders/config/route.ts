import {owner} from '@/lib/agentos/auth';
import {configuredOrderChain} from '@/lib/agentos/order-runtime';
import {DomainError} from '@/lib/agentos/engine';
export async function GET(request:Request){try{owner(request);const {deployment,evidence}=await configuredOrderChain(request);return Response.json({deployment,evidencePublishing:!!evidence},{headers:{'Cache-Control':'no-store'}});}catch(error){return Response.json({error:error instanceof DomainError?error.message:'Order configuration is unavailable.'},{status:error instanceof DomainError&&error.code==='UNAUTHORIZED'?401:503,headers:{'Cache-Control':'no-store'}});}}
