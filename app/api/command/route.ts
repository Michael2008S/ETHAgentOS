import { z } from 'zod';
import { owner, checkOrigin, execute } from '@/lib/agentos/store';
import { DomainError } from '@/lib/agentos/engine';
const id = z.string().min(1).max(128);
const skill = z.enum(['event-analysis', 'treasury-report']);
const command = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create_task'), requestId: id, taskId: id, agentId: id, title: z.string().min(1).max(160), budget: z.number().int().positive(), scenario: z.enum(['success', 'injection', 'interruption', 'invalid-delivery']) }),
  z.object({ type: z.literal('advance'), taskId: id, expectedStep: z.number().int().min(0).max(6) }),
  z.object({ type: z.literal('resume_task'), taskId: id }),
  z.object({ type: z.literal('cancel_task'), taskId: id }),
  z.object({ type: z.literal('update_policy'), policy: z.object({ active: z.boolean(), maxTaskBudget: z.number().int().positive(), dailyBudget: z.number().int().positive(), allowedSkills: z.array(skill).max(2) }) }),
  z.object({ type: z.literal('topup'), amount: z.number().int().positive(), requestId: id }),
  z.object({ type: z.literal('register_agent'), agent: z.object({ name: z.string().min(1).max(40), description: z.string().max(240), skill }), requestId: id }),
]);
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (!request.headers.get('content-type')?.includes('application/json')) return Response.json({ error: 'JSON required.' }, { status: 415 });
    const raw = await request.text();
    if (raw.length > 8192) return Response.json({ error: 'Request too large.' }, { status: 413 });
    const parsed = command.safeParse(JSON.parse(raw));
    if (!parsed.success) return Response.json({ error: parsed.error.issues.map(i => i.message).join('; ') }, { status: 400 });
    return Response.json(await execute(owner(request), parsed.data), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const status = e instanceof DomainError ? ({ UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409 }[e.code] ?? 400) : e instanceof SyntaxError ? 400 : 500;
    return Response.json({ error: e instanceof Error ? e.message : 'Operation failed.' }, { status });
  }
}
