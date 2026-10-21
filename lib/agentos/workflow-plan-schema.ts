import {z} from 'zod';
import {workflowInputSchema,workflowConditionSchema} from './workflow-schema.ts';
export const MAX_WORKFLOW_PLANS=20;
export const MAX_PLAN_CHOICES=32;
const cents=z.number().int().positive().max(1000000),id=z.string().min(1).max(128);
export const workflowPlanParametersSchema=z.object({
 requestId:z.string().uuid(),goal:z.string().trim().min(3).max(500),buyer:z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(v=>!/^0x0{40}$/.test(v)).transform(v=>v as `0x${string}`),vaultSessionId:z.string().uuid(),input:workflowInputSchema.optional(),totalBudget:cents,perStepBudget:cents,maxSteps:z.number().int().min(2).max(8).default(4),execution:z.enum(['builtin','supplier','any']).default('builtin'),allowConditions:z.boolean().default(false),timeoutSeconds:z.number().int().min(30).max(86400).default(300),
}).strict();
export type WorkflowPlanParameters=z.infer<typeof workflowPlanParametersSchema>;
export const workflowProgramSchema=z.object({status:z.enum(['planned','unsupported']),steps:z.array(z.object({choice:z.number().int().min(0).max(MAX_PLAN_CHOICES-1),source:z.number().int().min(-1).max(7),when:workflowConditionSchema.nullable().optional()}).strict()).max(8)}).strict();
export type WorkflowProgram=z.infer<typeof workflowProgramSchema>;
export const workflowModelProgramSchema=z.object({status:z.enum(['planned','unsupported']),steps:z.array(z.object({choice:z.string().min(1).max(512),source:z.number().int().min(-1).max(7),when:workflowConditionSchema.nullable()}).strict()).max(8)}).strict();
export const workflowPlanRequestSchema=z.union([
 workflowPlanParametersSchema.extend({action:z.literal('propose')}),
 z.object({action:z.literal('accept'),planId:id,digest:z.string().regex(/^0x[0-9a-f]{64}$/)}).strict(),
 z.object({action:z.literal('dismiss'),planId:id}).strict(),
]);
