import { after } from 'next/server';
import * as store from './store';
import { pendingTasks, runTask } from './runner';
import type { Workspace } from './types';

export function scheduleTasks(ownerId: string, state: Workspace, taskId?: string) {
  const staleBefore = new Date(Date.now() - 4000).toISOString();
  const tasks = pendingTasks(state, taskId ? undefined : staleBefore).filter(t => !taskId || t.id === taskId).slice(0, 16);
  if (!tasks.length) return;
  after(async () => {
    // Limit one invocation's fanout. The explicit runtime tick drains any remaining backlog.
    for (let i=0; i<tasks.length; i+=4) await Promise.all(tasks.slice(i,i+4).map(async task => {
      try {
        const result = await runTask(store, ownerId, task.id);
        if (result.status === 'retryable') console.error('[agentos] Task checkpoint awaits retry:', task.id);
      } catch { console.error('[agentos] Task execution failed; durable checkpoint retained:', task.id); }
    }));
  });
}
