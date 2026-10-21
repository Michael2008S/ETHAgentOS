import { owner, read } from '@/lib/agentos/store';
import {apiFailure} from '@/lib/agentos/api-failure';
import { scheduleTasks } from '@/lib/agentos/background';
import { scheduleOrders } from '@/lib/agentos/order-runtime';
import { deferInline } from '@/lib/agentos/auth';
export async function GET(request: Request) {
  try {
    const ownerId = owner(request), result = await read(ownerId);
    if (!deferInline(request)) {
      scheduleTasks(ownerId, result.state);
      scheduleOrders(ownerId,result.state,request);
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  }
  catch (e) { return apiFailure(e,'runtime'); }
}
