import { owner, read } from '@/lib/agentos/store';
import { DomainError } from '@/lib/agentos/engine';
import { scheduleTasks } from '@/lib/agentos/background';
import { scheduleOrders } from '@/lib/agentos/order-runtime';
export async function GET(request: Request) {
  try {
    const ownerId = owner(request), result = await read(ownerId);
    scheduleTasks(ownerId, result.state);
    scheduleOrders(ownerId,result.state,request);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Workspace unavailable.' }, { status: e instanceof DomainError && e.code === 'UNAUTHORIZED' ? 401 : 500 }); }
}
