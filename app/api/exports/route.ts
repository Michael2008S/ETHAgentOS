import { owner, read } from '@/lib/agentos/store';
import { buildExport, type ExportKind } from '@/lib/agentos/export';
import { DomainError } from '@/lib/agentos/engine';

export async function GET(request: Request) {
  try {
    const url=new URL(request.url),{state}=await read(owner(request));
    const result=buildExport(state,url.searchParams.get('kind') as ExportKind,url.searchParams.get('taskId')??undefined,url.searchParams.get('buyer')??undefined);
    return new Response('raw' in result?result.raw:JSON.stringify(result.body,null,2)+'\n',{headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Content-Disposition':`attachment; filename="${result.filename}"`,
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff',
    }});
  }catch(error){
    const status=error instanceof DomainError?({UNAUTHORIZED:401,FORBIDDEN:403,NOT_FOUND:404}[error.code]??400):500;
    return Response.json({error:error instanceof Error?error.message:'Export failed.'},{status});
  }
}
