import {z} from 'zod';
import {assertSkillDefinition,type SkillDefinition} from './skill-definition.ts';
import {validateVerification,type DeliveryVerification} from '../../cre/workflow/verify.ts';
import type {Skill} from './types.ts';
export const skillIdSchema=z.custom<Skill>(value=>typeof value==='string'&&(['event-analysis','treasury-report'].includes(value)||/^ext:[a-z][a-z0-9.-]{2,62}@(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$/.test(value)),'Invalid skill identifier.');
export const skillDefinitionSchema=z.custom<SkillDefinition>(value=>{try{assertSkillDefinition(value);return true;}catch{return false;}},'Invalid bounded skill definition.');
export const deliveryVerificationSchema=z.custom<DeliveryVerification>(value=>{try{validateVerification(value);return true;}catch{return false;}},'Invalid versioned delivery verification.');
