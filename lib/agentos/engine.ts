import type { Command, Event, Receipt, Task, TaskInput, Workspace } from './types.ts';
import { SKILLS } from './types.ts';
import { DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS, taskIsOverdue } from './lifecycle.ts';
import {assertSourceInput,sourceSummary} from './transfer-source.ts';
import {acceptedMemoryRecords} from '../../cre/workflow/verify.ts';

export class DomainError extends Error { code: string; constructor(message: string, code = 'INVALID_COMMAND') { super(message); this.code = code; } }
// Public, deterministic fixture. Never represented as live blockchain data.
export const DATASET = [
  { block: 7210010, from: 'treasury.eth', to: 'research.eth', cents: 12500 },
  { block: 7210016, from: 'treasury.eth', to: 'builders.eth', cents: 24000 },
  { block: 7210024, from: 'treasury.eth', to: 'research.eth', cents: 7500 },
  { block: 7210041, from: 'treasury.eth', to: 'publicgoods.eth', cents: 18000 },
  { block: 7210053, from: 'treasury.eth', to: 'builders.eth', cents: 9000 },
  { block: 7210079, from: 'treasury.eth', to: 'publicgoods.eth', cents: 4000 },
];

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  return '0x' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(v => v.toString(16).padStart(2, '0')).join('');
}
export async function verifyReceipt(receipt: Receipt): Promise<boolean> {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || receipt.version !== 'agentos.receipt.v1' || receipt.mode !== 'simulation' || receipt.currency !== 'testUSD' || !Number.isSafeInteger(receipt.amount) || receipt.amount <= 0) return false;
  const fields = ['version', 'mode', 'taskId', 'agentId', 'amount', 'currency', 'inputHash', 'outputHash', 'policyHash', 'settledAt', 'settlementId', 'digest'];
  if (Object.keys(receipt).length !== fields.length || fields.some(field => !Object.hasOwn(receipt, field))) return false;
  if ([receipt.taskId, receipt.agentId].some(id => typeof id !== 'string' || id.length < 1 || id.length > 128) || receipt.settlementId !== `${receipt.taskId}:settle`) return false;
  if ([receipt.inputHash, receipt.outputHash, receipt.policyHash, receipt.digest].some(hash => typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/.test(hash))) return false;
  if (typeof receipt.settledAt !== 'string' || !Number.isFinite(Date.parse(receipt.settledAt))) return false;
  const { digest: expected, ...body } = receipt;
  return await digest(body) === expected;
}
export function seed(now = new Date().toISOString()): Workspace {
  return {
    version: 1, createdAt: now,
    agents: [
      { id: 'atlas', name: 'Atlas', role: 'Onchain analyst', description: 'Turns contract events into verified, structured insights.', skill: 'event-analysis', price: 240, color: 'green', enabled: true, identity: 'local', createdAt: now },
      { id: 'sage', name: 'Sage', role: 'Treasury researcher', description: 'Maps treasury flows and recipient allocations.', skill: 'treasury-report', price: 360, color: 'purple', enabled: true, identity: 'local', createdAt: now },
      { id: 'relay', name: 'Relay', role: 'Event specialist', description: 'A second provider behind the same execution interface.', skill: 'event-analysis', price: 180, color: 'blue', enabled: true, identity: 'local', createdAt: now },
    ],
    tasks: [], ledger: [{ id: 'genesis', taskId: null, kind: 'deposit', amount: 10000, at: now, note: 'Sandbox allocation · no real funds' }],
    policy: { active: true, maxTaskBudget: 2500, dailyBudget: 10000, allowedSkills: ['event-analysis', 'treasury-report'] },
  };
}
export function wallet(s: Workspace) {
  const deposited = s.ledger.filter(l => l.kind === 'deposit').reduce((sum, l) => sum + l.amount, 0);
  const spent = s.ledger.filter(l => l.kind === 'settle').reduce((sum, l) => sum + l.amount, 0);
  const reserved = s.tasks.reduce((sum, t) => sum + t.reserved, 0);
  return { deposited, spent, reserved, available: deposited - spent - reserved };
}
function money(n: number, label: string, max = 1000000) {
  if (!Number.isSafeInteger(n) || n <= 0 || n > max) throw new DomainError(`${label} must be a positive amount in cents (maximum ${max / 100}).`);
}
function event(t: Task, now: string, title: string, detail: string, level: Event['level'] = 'info') {
  t.events.push({ id: `${t.id}:${t.events.length}`, at: now, title, detail, level, step: t.step });
  t.updatedAt = now;
}
function ledger(s: Workspace, t: Task, now: string, kind: 'reserve' | 'release' | 'settle', amount: number, note: string) {
  if (amount <= 0) return;
  const id = `${t.id}:${kind}`;
  if (s.ledger.some(l => l.id === id)) throw new DomainError('Duplicate ledger operation.', 'INVARIANT');
  s.ledger.push({ id, taskId: t.id, kind, amount, at: now, note });
}
function release(s: Workspace, t: Task, now: string, note: string) {
  ledger(s, t, now, 'release', t.reserved, note); t.reserved = 0;
}
function deny(s: Workspace, t: Task, now: string, reason: string) {
  release(s, t, now, 'Reservation returned after policy denial');
  t.status = 'blocked'; event(t, now, 'Execution blocked', reason, 'error');
}
function checkPolicy(s: Workspace, t: Task, now: string): string | null {
  if (!s.policy.active) return 'Execution permission has been revoked. No further unpaid operations are permitted.';
  if (!s.agents.find(a => a.id === t.agentId)?.enabled) return 'Agent is disabled.';
  if (!s.policy.allowedSkills.includes(t.skill)) return `Skill ${t.skill} is outside the allowlist.`;
  if (t.budget > s.policy.maxTaskBudget) return 'Task budget exceeds the per-task limit.';
  const spentToday = s.ledger.filter(l => l.kind === 'settle' && l.at.slice(0, 10) === now.slice(0, 10)).reduce((sum, l) => sum + l.amount, 0);
  const otherReservations = s.tasks.filter(x => x.id !== t.id).reduce((sum, x) => sum + x.reserved, 0);
  if (spentToday + otherReservations + t.budget > s.policy.dailyBudget) return 'Daily allowance (UTC), including in-flight reservations, would be exceeded.';
  return null;
}
export function normalizeInput(input?: TaskInput): TaskInput {
  if (input === undefined) return { dataset:'eth-shenzhen-fixture-v1', blockFrom:7210000, blockTo:7210100 };
  if (!input || !['eth-shenzhen-fixture-v1','custom-transfers-v1'].includes(input.dataset) || !Number.isSafeInteger(input.blockFrom) || !Number.isSafeInteger(input.blockTo) || input.blockFrom < 0 || input.blockTo < input.blockFrom) throw new DomainError('Invalid input dataset or block range.');
  const normalized: TaskInput = {dataset:input.dataset,blockFrom:input.blockFrom,blockTo:input.blockTo};
  if (input.dataset === 'eth-shenzhen-fixture-v1') {
    if (input.records !== undefined||input.source!==undefined||input.memory!==undefined) throw new DomainError('Fixture input cannot override records or source.');
    return normalized;
  }
  if (!Array.isArray(input.records) || input.records.length < 1 || input.records.length > 100) throw new DomainError('Custom input requires 1–100 transfer records.');
  let total = 0;
  normalized.records = input.records.map(row => {
    if (!row || !Number.isSafeInteger(row.block) || row.block < 0 || !Number.isSafeInteger(row.cents) || row.cents < 0 || [row.from,row.to].some(value => typeof value !== 'string' || !value.trim() || value.length > 128)) throw new DomainError('Invalid transfer record. Use whole blocks and nonnegative integer cents.');
    total += row.cents;
    if (!Number.isSafeInteger(total)) throw new DomainError('Transfer total exceeds the safe integer range.');
    return {block:row.block,from:row.from.trim(),to:row.to.trim(),cents:row.cents};
  });
  if(input.source!==undefined){try{normalized.source=assertSourceInput(input.source,normalized);}catch{throw new DomainError('Transfer records do not match their source provenance.');}}
  if(input.memory!==undefined){try{if(input.source||input.blockFrom!==0||input.blockTo!==0||canonical(acceptedMemoryRecords(input.memory))!==canonical(normalized.records))throw new Error();normalized.memory=structuredClone(input.memory);}catch{throw new DomainError('Transfer records do not match the accepted artifact memory.');}}
  if (canonical(normalized).length > 32768) throw new DomainError('Custom input is too large.');
  return normalized;
}
export function expectedOutput(t: Pick<Task, 'skill' | 'input'>): Record<string, unknown> {
  const rows = (t.input.records ?? DATASET).filter(r => r.block >= t.input.blockFrom && r.block <= t.input.blockTo);
  const base = { dataset: t.input.dataset, blockFrom: t.input.blockFrom, blockTo: t.input.blockTo, transferCount: rows.length, totalCents: rows.reduce((sum, r) => sum + r.cents, 0),...(t.input.source?{source:sourceSummary(assertSourceInput(t.input.source,t.input),t.skill)}:{}) };
  if (t.skill === 'event-analysis') return { ...base, uniqueRecipients: new Set(rows.map(r => r.to)).size };
  const allocations = new Map<string, number>();
  for (const row of rows) allocations.set(row.to, (allocations.get(row.to) ?? 0) + row.cents);
  return { ...base, allocations: Object.fromEntries(allocations) };
}
// Every adapter tool call passes through this capability boundary.
export function authorizeOperation(skill: Task['skill'], operation: string) {
  if (!SKILLS.find(s => s.id === skill)?.permissions.includes(operation)) throw new DomainError(`${operation} is outside the skill capability grant.`, 'CAPABILITY_DENIED');
}
export function assertInvariants(s: Workspace) {
  const w = wallet(s);
  if (Object.values(w).some(n => !Number.isSafeInteger(n) || n < 0)) throw new DomainError('Ledger conservation violated.', 'INVARIANT');
  if (new Set(s.ledger.map(l => l.id)).size !== s.ledger.length) throw new DomainError('Ledger IDs must be unique.', 'INVARIANT');
  for (const t of s.tasks) {
    if (!Number.isSafeInteger(t.reserved) || t.reserved < 0 || !Number.isSafeInteger(t.paid) || t.paid < 0) throw new DomainError('Invalid task balance.', 'INVARIANT');
    if (t.paid > t.budget || t.paid > 0 && (t.reserved !== 0 || !t.receipt)) throw new DomainError('Invalid settlement.', 'INVARIANT');
    if (['completed', 'blocked', 'refunded', 'cancelled', 'expired'].includes(t.status) && t.reserved !== 0) throw new DomainError('Terminal task retains reservation.', 'INVARIANT');
    if (s.ledger.filter(l => l.kind === 'settle' && l.taskId === t.id).reduce((sum, l) => sum + l.amount, 0) !== t.paid) throw new DomainError('Task and ledger disagree.', 'INVARIANT');
  }
}

// Pure, replay-safe transition. Persistence uses optimistic CAS over this entire aggregate.
export async function transition(input: Workspace, command: Command, now = new Date().toISOString()): Promise<Workspace> {
  const s = structuredClone(input);
  if (command.type === 'create_task') {
    const taskInput = normalizeInput(command.input);
    const prior = s.tasks.find(t => t.requestId === command.requestId);
    if (prior) {
      if (prior.id !== command.taskId || prior.agentId !== command.agentId || prior.title !== command.title.trim() || prior.budget !== command.budget || prior.scenario !== command.scenario || (prior.executionMode ?? 'automatic') !== (command.executionMode ?? 'automatic') || (prior.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) !== (command.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) || canonical(prior.input) !== canonical(taskInput)) throw new DomainError('Request ID was already used with different task parameters.', 'IDEMPOTENCY_CONFLICT');
      return s;
    }
    if (s.tasks.some(t => t.id === command.taskId)) throw new DomainError('Task ID already exists.');
    if (!command.requestId || command.requestId.length > 128 || !command.taskId || command.taskId.length > 128) throw new DomainError('Invalid task identifier.');
    if (!['success', 'injection', 'interruption', 'invalid-delivery'].includes(command.scenario)) throw new DomainError('Unknown scenario.');
    const agent = s.agents.find(a => a.id === command.agentId);
    if (!agent) throw new DomainError('Unknown agent.');
    if (!agent.enabled) throw new DomainError('Agent is disabled.');
    money(command.budget, 'Budget');
    if (command.budget < agent.price) throw new DomainError('Budget must cover the service quote.');
    const title = command.title.trim();
    if (!title || title.length > 160) throw new DomainError('Task title must be 1–160 characters.');
    if (s.tasks.length >= 300) throw new DomainError('This prototype supports up to 300 tasks per workspace.');
    const timeoutSeconds = command.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
    if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > MAX_TIMEOUT_SECONDS) throw new DomainError('Execution window must be 1–86400 whole seconds.');
    const task: Task = { timeoutSeconds, deadlineAt: new Date(Date.parse(now) + timeoutSeconds * 1000).toISOString(), executionMode: command.executionMode ?? 'automatic', id: command.taskId, requestId: command.requestId, title, agentId: agent.id, skill: agent.skill, scenario: command.scenario, budget: command.budget, quote: agent.price, reserved: 0, paid: 0, step: 0, status: 'queued', createdAt: now, updatedAt: now, input: taskInput, inputHash: await digest(taskInput), output: null, outputHash: null, receipt: null, events: [], policySnapshot: null };
    event(task, now, 'Task accepted', `Assigned to ${agent.name}. ${taskInput.records ? 'Custom input adapter' : 'Local fixture adapter'} ${agent.skill}@1.0.0.`);
    s.tasks.unshift(task);
  } else if (command.type === 'update_agent') {
    const agent = s.agents.find(a => a.id === command.agentId);
    if (!agent) throw new DomainError('Unknown agent.', 'NOT_FOUND');
    money(command.price, 'Service quote');
    if (typeof command.enabled !== 'boolean') throw new DomainError('Invalid service availability.');
    agent.enabled = command.enabled; agent.price = command.price;
    if (!agent.enabled) for (const task of s.tasks) {
      if (task.agentId !== agent.id || task.paid > 0 || !['queued', 'running', 'paused'].includes(task.status)) continue;
      if (taskIsOverdue(task, now)) {
        release(s, task, now, 'Reservation returned after deadline');
        task.status = 'expired'; event(task, now, 'Task expired', 'Execution deadline passed before payment. All unpaid reserved funds were released.', 'warning');
      } else deny(s, task, now, 'Agent is disabled.');
    }
  } else if (command.type === 'update_policy') {
    money(command.policy.maxTaskBudget, 'Per-task limit'); money(command.policy.dailyBudget, 'Daily limit');
    if (typeof command.policy.active !== 'boolean' || !Array.isArray(command.policy.allowedSkills) || command.policy.allowedSkills.some(k => !SKILLS.some(x => x.id === k))) throw new DomainError('Invalid policy.');
    s.policy = { ...command.policy, allowedSkills: [...new Set(command.policy.allowedSkills)] };
  } else if (command.type === 'topup') {
    money(command.amount, 'Allocation', 100000);
    if (!command.requestId || command.requestId.length > 128) throw new DomainError('Invalid allocation identifier.');
    const id = 'deposit:' + command.requestId;
    if (s.ledger.some(l => l.id === id && l.amount !== command.amount)) throw new DomainError('Request ID was already used with a different allocation.', 'IDEMPOTENCY_CONFLICT');
    if (!s.ledger.some(l => l.id === id)) s.ledger.push({ id, taskId: null, kind: 'deposit', amount: command.amount, at: now, note: 'Sandbox allocation · no real funds' });
  } else if (command.type === 'register_agent') {
    const name = command.agent.name.trim();
    if (!name || name.length > 40 || command.agent.description.length > 240 || !SKILLS.some(x => x.id === command.agent.skill)) throw new DomainError('Invalid agent profile.');
    if (!command.requestId || command.requestId.length > 128) throw new DomainError('Invalid agent identifier.');
    const id = `custom-${command.requestId}`;
    const prior = s.agents.find(a => a.id === id);
    if (prior && (prior.name !== name || prior.description !== command.agent.description || prior.skill !== command.agent.skill)) throw new DomainError('Request ID was already used with a different agent profile.', 'IDEMPOTENCY_CONFLICT');
    if (!s.agents.some(a => a.id === id)) s.agents.push({ id, name, description: command.agent.description, skill: command.agent.skill, role: 'Custom service', price: command.agent.skill === 'event-analysis' ? 240 : 360, color: 'orange', enabled: true, identity: 'local', createdAt: now });
  } else {
    const t = s.tasks.find(t => t.id === command.taskId);
    if (!t) throw new DomainError('Task not found.', 'NOT_FOUND');
    if (taskIsOverdue(t, now)) {
      release(s, t, now, 'Reservation returned after deadline');
      t.status = 'expired'; event(t, now, 'Task expired', 'Execution deadline passed before payment. All unpaid reserved funds were released.', 'warning');
    } else if (command.type === 'expire_task') {
      return s;
    } else if (command.type === 'resume_task') {
      if (t.status !== 'paused') return s;
      t.status = 'running'; event(t, now, 'Execution resumed', 'Durable checkpoint recovered. Existing settlement will be reused.', 'success');
    } else if (command.type === 'cancel_task') {
      if (t.paid > 0) throw new DomainError('A settled task cannot be cancelled. Resume it to finalize the receipt.');
      if (['completed', 'blocked', 'refunded', 'cancelled', 'expired'].includes(t.status)) return s;
      release(s, t, now, 'Reservation returned after cancellation');
      t.status = 'cancelled'; event(t, now, 'Task cancelled', 'All unpaid reserved funds are available again.', 'warning');
    } else if (command.type === 'advance') {
      if (t.step !== command.expectedStep || !['queued', 'running'].includes(t.status)) return s;
      t.status = 'running';
      // Check current authority before every unpaid action, including final settlement.
      const violation = t.paid === 0 ? checkPolicy(s, t, now) : null;
      if (violation) deny(s, t, now, violation);
      else if (t.step === 0) {
        t.policySnapshot = structuredClone(s.policy);
        event(t, now, 'Permissions granted', `${t.skill} is allowed. Budget and service quote are within policy.`, 'success'); t.step = 1;
      } else if (t.step === 1) {
        if (wallet(s).available < t.budget) deny(s, t, now, 'Insufficient unreserved sandbox funds.');
        else { t.reserved = t.budget; ledger(s, t, now, 'reserve', t.budget, 'Task budget reserved'); event(t, now, 'Budget reserved', `${(t.budget / 100).toFixed(2)} testUSD locked against concurrent spending.`, 'success'); t.step = 2; }
      } else if (t.step === 2) {
        try {
          authorizeOperation(t.skill, 'dataset.read');
          if (t.scenario === 'injection') {
            event(t, now, 'Untrusted tool instruction detected', 'Fixture requested wallet.transfer to an unapproved recipient. Tool operations are checked against the skill capability grant.', 'warning');
            authorizeOperation(t.skill, 'wallet.transfer');
          }
          authorizeOperation(t.skill, 'artifact.write');
          t.output = expectedOutput(t);
          if (t.scenario === 'invalid-delivery') t.output.totalCents = Number(t.output.totalCents) + 1;
          t.outputHash = await digest(t.output);
          event(t, now, 'Artifact generated', t.input.records ? 'Custom transfer analysis completed. Input and output remain local; no LLM or live RPC was called.' : 'Built-in deterministic adapter completed. SHA-256 digest recorded; no LLM or live RPC was called.', 'success'); t.step = 3;
        } catch (error) {
          if (error instanceof DomainError && error.code === 'CAPABILITY_DENIED') deny(s, t, now, error.message + ' No payment was made.');
          else throw error;
        }
      } else if (t.step === 3) {
        const expected = expectedOutput(t);
        if (canonical(expected) !== canonical(t.output)) {
          release(s, t, now, 'Reservation returned after invalid delivery'); t.status = 'refunded';
          event(t, now, 'Delivery rejected', 'Independent input recomputation disagrees with the delivery. No service payment was made.', 'error');
        } else { event(t, now, 'Delivery verified locally', 'All expected fields match the reference calculation. This local verifier is not a deployed Chainlink DON.', 'success'); t.step = 4; }
      } else if (t.step === 4) {
        if (t.reserved < t.quote || !t.output || !t.outputHash) throw new DomainError('Task is not ready to settle.');
        const body: Omit<Receipt, 'digest'> = { version: 'agentos.receipt.v1', mode: 'simulation', taskId: t.id, agentId: t.agentId, amount: t.quote, currency: 'testUSD', inputHash: await digest(t.input), outputHash: t.outputHash, policyHash: await digest(s.policy), settledAt: now, settlementId: `${t.id}:settle` };
        t.receipt = { ...body, digest: await digest(body) };
        ledger(s, t, now, 'settle', t.quote, 'Verified service fee');
        ledger(s, t, now, 'release', t.reserved - t.quote, 'Unused reservation returned');
        t.paid = t.quote; t.reserved = 0; t.step = 5;
        event(t, now, 'Settlement committed', `${(t.quote / 100).toFixed(2)} testUSD paid exactly once. Ledger and receipt committed in one state update.`, 'success');
        if (t.scenario === 'interruption') { t.status = 'paused'; event(t, now, 'Worker interruption simulated', 'Stopped immediately after durable settlement. Resume to finalize without paying again.', 'warning'); }
      } else if (t.step === 5) {
        t.status = 'completed'; t.step = 6;
        event(t, now, 'Task completed', 'Execution receipt is ready to inspect, verify and export.', 'success');
      }
    }
  }
  assertInvariants(s);
  return s;
}
