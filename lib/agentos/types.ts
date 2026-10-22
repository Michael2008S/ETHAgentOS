export type Scenario = 'success' | 'injection' | 'interruption' | 'invalid-delivery';
export type TaskStatus = 'queued' | 'running' | 'paused' | 'completed' | 'blocked' | 'refunded' | 'cancelled' | 'expired';
export type Skill = 'event-analysis' | 'treasury-report' | `ext:${string}`;
export type TransferRecord = { block: number; from: string; to: string; cents: number };
export type TaskInput = { dataset: string; blockFrom: number; blockTo: number; records?: TransferRecord[];source?:import('./transfer-source.ts').TransferSource;memory?:import('../../cre/workflow/verify.ts').AcceptedMemory;skillDefinition?:import('./skill-definition.ts').SkillDefinition };
export type Agent = { id: string; name: string; role: string; description: string; skill: Skill; price: number; color: string; enabled: boolean; identity: 'local'; createdAt: string };
export type Event = { id: string; at: string; level: 'info' | 'success' | 'warning' | 'error'; title: string; detail: string; step: number };
export type Policy = { active: boolean; maxTaskBudget: number; dailyBudget: number; allowedSkills: Skill[] };
export type Receipt = { version: 'agentos.receipt.v1'; mode: 'simulation'; taskId: string; agentId: string; amount: number; currency: 'testUSD'; inputHash: string; outputHash: string; policyHash: string; settledAt: string; settlementId: string; digest: string };
export type Task = { timeoutSeconds?: number; deadlineAt?: string; executionMode?: 'automatic' | 'manual'; id: string; requestId: string; title: string; agentId: string; skill: Skill; scenario: Scenario; budget: number; quote: number; reserved: number; paid: number; step: number; status: TaskStatus; createdAt: string; updatedAt: string; input: TaskInput; inputHash?: string; output: Record<string, unknown> | null; outputHash: string | null; receipt: Receipt | null; events: Event[]; policySnapshot: Policy | null };
export type LedgerEntry = { id: string; taskId: string | null; kind: 'deposit' | 'reserve' | 'release' | 'settle'; amount: number; at: string; note: string };
export type Workspace = { version: 1; serviceTemplates?:import('./service-template-protocol.ts').ServiceTemplate[]; servicePlans?:import('./service-plans.ts').ServiceProposal[]; pluginPurchases?:import('./plugin-purchase-protocol.ts').PluginPurchaseRef[]; pluginRevision?:number; pluginJobs?:import('./plugin-state.ts').PluginJobRef[]; workflowRepairPolicies?:import('./workflow-repair-policy.ts').WorkflowRepairPolicy[]; workflowTemplates?:import('./workflow-templates.ts').WorkflowTemplate[]; workflowPlans?:import('./workflow-plans.ts').WorkflowProposal[]; purchaseRoutes?:import('./purchase-route-state.ts').PurchaseRoute[]; skillDefinitions?:import('./skill-definition.ts').SkillDefinition[]; workflows?:import('./workflow-state.ts').AgentWorkflow[]; vaultSessions?:import('./vault.ts').VaultSession[]; agents: Agent[]; tasks: Task[]; ledger: LedgerEntry[]; policy: Policy; createdAt: string; chainChallenges?: import('./chain-reconciliation.ts').ChainChallenge[]; chainReceipts?: import('./chain-reconciliation.ts').SavedChainReceipt[]; chainOrders?: import('./orders.ts').ChainOrder[]; agentIdentities?: import('./identity.ts').AgentIdentity[]; identityChallenges?: import('./identity.ts').IdentityChallenge[]; agentFeedback?: import('./identity.ts').PaidFeedback[] };
export type Command =
  | { type: 'register_skill'; definition: import('./skill-definition.ts').SkillDefinition }
  | { type: 'create_task'; input?: TaskInput; timeoutSeconds?: number; executionMode?: 'automatic' | 'manual'; requestId: string; taskId: string; agentId: string; title: string; budget: number; scenario: Scenario }
  | { type: 'advance'; taskId: string; expectedStep: number }
  | { type: 'resume_task'; taskId: string }
  | { type: 'cancel_task'; taskId: string }
  | { type: 'expire_task'; taskId: string }
  | { type: 'update_policy'; policy: Policy }
  | { type: 'update_agent'; agentId: string; enabled: boolean; price: number }
  | { type: 'topup'; amount: number; requestId: string }
  | { type: 'register_agent'; agent: Pick<Agent, 'name' | 'description' | 'skill'>; requestId: string };
export const STEPS = ['Authorize', 'Reserve', 'Execute', 'Verify', 'Settle', 'Complete'] as const;
export const SKILLS: { id: Skill; name: string; description: string; permissions: string[]; version: string }[] = [
  { id: 'event-analysis', name: 'Event analysis', description: 'Aggregate a fixed, reproducible ERC-20 transfer dataset.', permissions: ['dataset.read', 'artifact.write'], version: '1.0.0' },
  { id: 'treasury-report', name: 'Treasury report', description: 'Produce a deterministic allocation report from the same dataset.', permissions: ['dataset.read', 'artifact.write'], version: '1.0.0' },
];
