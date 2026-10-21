import { owner, read } from '@/lib/agentos/store';
import {apiFailure} from '@/lib/agentos/api-failure';
export async function GET(request: Request) {
  try {
    const ownerId = owner(request), result = await read(ownerId);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  }
  catch (e) { return apiFailure(e,'runtime'); }
}
