import { owner, read } from '@/lib/agentos/store';
import { DomainError } from '@/lib/agentos/engine';
import { parseMemoryQuery, queryMemory, exportMemory } from '@/lib/agentos/memory';

export async function GET(request: Request) {
  try {
    const ownerId=owner(request),params=new URL(request.url).searchParams;
    const query=parseMemoryQuery(params),{state,revision}=await read(ownerId);
    const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
    if(params.get('format')==='export')return Response.json(exportMemory(state,query),{headers:{...headers,'Content-Disposition':'attachment; filename="agentos-memory.json"'}});
    return Response.json({...queryMemory(state,query),revision},{headers});
  } catch(error) {
    const status=error instanceof DomainError?({UNAUTHORIZED:401,FORBIDDEN:403}[error.code]??400):500;
    return Response.json({error:error instanceof Error?error.message:'Memory search failed.'},{status});
  }
}
