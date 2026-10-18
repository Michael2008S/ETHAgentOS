import type { Task } from './types.ts';

export const DEFAULT_TIMEOUT_SECONDS = 300;
export const MAX_TIMEOUT_SECONDS = 86400;

// Legacy tasks receive the same finite window as newly created default tasks.
export function taskDeadline(task: Pick<Task, 'createdAt' | 'deadlineAt'>): string {
  return task.deadlineAt ?? new Date(Date.parse(task.createdAt) + DEFAULT_TIMEOUT_SECONDS * 1000).toISOString();
}

export function taskIsOverdue(task: Task, now = new Date().toISOString()): boolean {
  return task.paid === 0 && ['queued', 'running', 'paused'].includes(task.status) && Date.parse(now) >= Date.parse(taskDeadline(task));
}
