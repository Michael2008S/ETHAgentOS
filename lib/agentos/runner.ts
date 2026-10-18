import { DomainError } from './engine.ts';
import type { Command, TaskStatus, Workspace } from './types.ts';

export type RuntimeStore = {
  read(ownerId: string): Promise<{state: Workspace}>;
  execute(ownerId: string, command: Command): Promise<{state: Workspace}>;
};
export type RunResult = { taskId: string; status: TaskStatus | 'missing' | 'retryable'; transitions: number; retries: number };
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Bounded worker invocation. Checkpoints, not this process, are the durable source of truth. */
export async function runTask(store: RuntimeStore, ownerId: string, taskId: string, options: {delayMs?: number; maxTransitions?: number; maxRetries?: number} = {}): Promise<RunResult> {
  const delay = options.delayMs ?? 750, limit = options.maxTransitions ?? 16, retryLimit = options.maxRetries ?? 3;
  let transitions = 0, retries = 0;
  while (transitions < limit) {
    try {
      const {state} = await store.read(ownerId);
      const task = state.tasks.find(t => t.id === taskId);
      if (!task) return {taskId, status:'missing', transitions, retries};
      if (!['queued','running'].includes(task.status)) return {taskId, status:task.status, transitions, retries};
      if (delay) await sleep(delay);
      await store.execute(ownerId, {type:'advance', taskId, expectedStep:task.step});
      transitions++;
    } catch (error) {
      // Invalid business operations are permanent. Storage/CAS failures can retry safely.
      if (error instanceof DomainError && error.code !== 'CONFLICT') throw error;
      if (retries >= retryLimit) return {taskId, status:'retryable', transitions, retries};
      retries++;
      if (delay) await sleep(Math.min(delay * 2 ** retries, 2000));
    }
  }
  return {taskId, status:'retryable', transitions, retries};
}

export function pendingTasks(state: Workspace, staleBefore?: string) {
  return state.tasks.filter(t => t.executionMode !== 'manual' && ['queued','running'].includes(t.status) && (!staleBefore || t.updatedAt < staleBefore)).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
}
