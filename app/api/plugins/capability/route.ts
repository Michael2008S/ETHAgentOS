import {z} from 'zod';
import {pluginCapability} from '@/lib/agentos/plugin-runner';
import {pluginDatabase} from '@/lib/agentos/plugin-runtime';
import {checkOrigin} from '@/lib/agentos/auth';
const schema=z.object({scope:z.string().regex(/^0x[0-9a-f]{64}$/),jobId:z.string().regex(/^plugin-job-[0-9a-f-]{36}$/),token:z.string().regex(/^[0-9a-f]{64}$/),requestHash:z.string().regex(/^0x[0-9a-f]{64}$/),tool:z.object({serverId:z.string().max(64),name:z.string().max(80),toolHash:z.string().regex(/^0x[0-9a-f]{64}$/)}).strict().optional()}).strict();
/** Lease bearer authorizes only checking an already reviewed job, never new jobs. */
export async function POST(request:Request){try{checkOrigin(request);const reader=request.body?.getReader();if(!reader)throw Error();const bytes:Uint8Array[]=[];let size=0;try{for(;;){const r=await reader.read();if(r.done)break;if((size+=r.value.length)>4096){await reader.cancel();throw Error();}bytes.push(r.value);}}finally{reader.releaseLock();}const text=new TextDecoder().decode(Uint8Array.from(bytes.flatMap(v=>Array.from(v)))),body=schema.parse(JSON.parse(text));await pluginCapability(pluginDatabase(),body);return Response.json({allowed:true,requestHash:body.requestHash},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Plugin execution capability refused.'},{status:403,headers:{'Cache-Control':'no-store'}});}}
