import {z} from 'zod';
import {skillDefinitionSchema} from './skill-schema.ts';
import {transferSourceSchema} from './transfer-source.ts';
import {acceptedArtifactSchema} from './artifact-memory.ts';
const integer=z.number().int().nonnegative().safe();
export const chainOrderInputSchema=z.object({skillDefinition:skillDefinitionSchema.optional(),dataset:z.enum(['eth-shenzhen-fixture-v1','custom-transfers-v1']),blockFrom:integer,blockTo:integer,source:transferSourceSchema.optional(),memory:z.lazy(()=>acceptedArtifactSchema).optional(),records:z.array(z.object({block:integer,from:z.string().min(1).max(128),to:z.string().min(1).max(128),cents:integer}).strict()).min(1).max(100).optional()}).strict();
