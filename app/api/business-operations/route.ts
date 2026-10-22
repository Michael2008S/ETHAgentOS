import {env} from 'cloudflare:workers';
import type {BusinessJobState} from '@/lib/agentos/business-execution';
import {configuredDataReplay} from '@/lib/agentos/data-runtime';
import {owner,read} from '@/lib/agentos/store';import {apiFailure} from '@/lib/agentos/api-failure';import {businessOperations,businessOperationCounts} from '@/lib/agentos/business-operations';
export async function GET(request:Request){try{const ownerId=owner(request),s=await read(ownerId),jobs=await env.DB!.prepare('SELECT task_id,status,failures,available_at FROM agentos_runtime_jobs WHERE owner_id=?').bind(ownerId).all<BusinessJobState>();return Response.json({scope:s.scope,sourceMode:configuredDataReplay(request)?'captured-finalized-replay':'live-finalized-read',operations:businessOperations(s.state,jobs.results),counts:businessOperationCounts(s.state)},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return apiFailure(e,'runtime');}}
