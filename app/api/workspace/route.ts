import { owner, read } from '@/lib/agentos/store';
import { DomainError } from '@/lib/agentos/engine';
export async function GET(request: Request) {
  try { return Response.json(await read(owner(request)), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Workspace unavailable.' }, { status: e instanceof DomainError && e.code === 'UNAUTHORIZED' ? 401 : 500 }); }
}
