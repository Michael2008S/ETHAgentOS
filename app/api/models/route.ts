import { owner } from '@/lib/agentos/auth';
import { configuredPlanner } from '@/lib/agentos/model-runtime';
import { DomainError } from '@/lib/agentos/engine';
export async function GET(request:Request){
  try{owner(request);const planner=await configuredPlanner(request);return Response.json({configured:true,descriptor:planner.descriptor},{headers:{'Cache-Control':'no-store'}});}
  catch(error){const status=error instanceof DomainError&&error.code==='UNAUTHORIZED'?401:503;return Response.json({configured:false,error:status===401?'Sign in to access your workspace.':'Model service is not configured.'},{status,headers:{'Cache-Control':'no-store'}});}
}
