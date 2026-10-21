import {skillIdSchema,skillDefinitionSchema} from '@/lib/agentos/skill-schema';
import {checkInputSource} from '@/lib/agentos/data-runtime';
import {transferSourceSchema} from '@/lib/agentos/transfer-source';
import { z } from 'zod';
import { owner, checkOrigin, execute, read } from '@/lib/agentos/store';
import { DomainError } from '@/lib/agentos/engine';
import { scheduleTasks } from '@/lib/agentos/background';
import { isLoopback, deferInline } from '@/lib/agentos/auth';
const id = z.string().min(1).max(128);
const skill = skillIdSchema;
const taskInput = z.object({skillDefinition:skillDefinitionSchema.optional(),dataset:z.enum(['eth-shenzhen-fixture-v1','custom-transfers-v1']),blockFrom:z.number().int().nonnegative().safe(),blockTo:z.number().int().nonnegative().safe(),source:transferSourceSchema.optional(),records:z.array(z.object({block:z.number().int().nonnegative().safe(),from:z.string().min(1).max(128),to:z.string().min(1).max(128),cents:z.number().int().nonnegative().safe()}).strict()).min(1).max(100).optional()}).strict();
const command = z.discriminatedUnion('type', [
  z.object({type:z.literal('register_skill'),definition:skillDefinitionSchema}).strict(),
  z.object({ type: z.literal('create_task'), input: taskInput.optional(), timeoutSeconds: z.number().int().min(1).max(86400).optional(), executionMode: z.enum(['automatic','manual']).optional(), requestId: id, taskId: id, agentId: id, title: z.string().min(1).max(160), budget: z.number().int().positive(), scenario: z.enum(['success', 'injection', 'interruption', 'invalid-delivery']) }),
  z.object({ type: z.literal('advance'), taskId: id, expectedStep: z.number().int().min(0).max(6) }),
  z.object({ type: z.literal('resume_task'), taskId: id }),
  z.object({ type: z.literal('cancel_task'), taskId: id }),
  z.object({ type: z.literal('expire_task'), taskId: id }),
  z.object({ type: z.literal('update_policy'), policy: z.object({ active: z.boolean(), maxTaskBudget: z.number().int().positive(), dailyBudget: z.number().int().positive(), allowedSkills: z.array(skill).max(22) }) }),
  z.object({ type: z.literal('update_agent'), agentId: id, enabled: z.boolean(), price: z.number().int().positive().max(1000000) }),
  z.object({ type: z.literal('topup'), amount: z.number().int().positive(), requestId: id }),
  z.object({ type: z.literal('register_agent'), agent: z.object({ name: z.string().min(1).max(40), description: z.string().max(240), skill }), requestId: id }),
]);
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (!request.headers.get('content-type')?.includes('application/json')) return Response.json({ error: 'JSON required.' }, { status: 415 });
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 65536) return Response.json({ error: 'Request too large.' }, { status: 413 });
    const parsed = command.safeParse(JSON.parse(raw));
    if (!parsed.success) return Response.json({ error: parsed.error.issues.map(i => i.message).join('; ') }, { status: 400 });
    if (parsed.data.type === 'create_task' && parsed.data.executionMode === 'manual' && (!isLoopback(new URL(request.url)) || !request.headers.has('x-agentos-sandbox'))) throw new DomainError('Manual execution is restricted to isolated local tests.', 'FORBIDDEN');
    const ownerId = owner(request);
    if(parsed.data.type==='create_task'&&parsed.data.input?.source){const snapshot=await read(ownerId),requestId=parsed.data.requestId;if(!snapshot.state.tasks.some(t=>t.requestId===requestId))await checkInputSource(request,parsed.data.input);}
    const result = await execute(ownerId, parsed.data);
    if (!deferInline(request) && (parsed.data.type === 'create_task' || parsed.data.type === 'resume_task')) scheduleTasks(ownerId, result.state, parsed.data.taskId);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const status = e instanceof DomainError ? ({ UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409, UNAVAILABLE:503 }[e.code] ?? 400) : e instanceof SyntaxError ? 400 : 500;
    return Response.json({ error: e instanceof Error ? e.message : 'Operation failed.' }, { status });
  }
}
