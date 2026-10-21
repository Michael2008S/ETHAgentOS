import {z} from 'zod';
import {chainOrderInputSchema} from './order-input-schema.ts';
import {supplierQuoteSchema} from './supplier-quote.ts';
const id=z.string().min(1).max(128),supplier=z.string().regex(/^[a-z0-9-]{1,64}$/);
export const routeBaseSchema=z.object({requestId:z.string().uuid(),title:z.string().trim().min(1).max(120),buyer:z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(v=>!/^0x0{40}$/.test(v)).transform(v=>v as `0x${string}`),vaultSessionId:z.string().uuid(),input:chainOrderInputSchema.optional(),totalBudget:z.number().int().positive().max(1000000),timeoutSeconds:z.number().int().min(30).max(86400).default(300),strategy:z.enum(['priority','lowest-price']).default('priority')});
export const purchaseRouteDraftSchema=routeBaseSchema.extend({offers:z.array(z.object({agentId:id,supplierId:supplier,supplierQuote:supplierQuoteSchema}).strict()).min(2).max(3)}).strict();
export const purchaseRouteRequestSchema=z.union([routeBaseSchema.extend({action:z.literal('prepare'),candidates:z.array(z.object({agentId:id,supplierId:supplier}).strict()).min(2).max(3)}).strict(),purchaseRouteDraftSchema.extend({action:z.literal('create')}).strict(),z.object({action:z.enum(['resume','cancel','sync']),routeId:id}).strict()]);
