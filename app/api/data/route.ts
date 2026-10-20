import {z} from 'zod';
import {owner,checkOrigin} from '@/lib/agentos/auth';
import {importChainData} from '@/lib/agentos/data-runtime';
import {sourceCommitment} from '@/lib/agentos/transfer-source';
import {apiFailure} from '@/lib/agentos/api-failure';
const query=z.object({account:z.string().regex(/^0x[0-9a-fA-F]{40}$/),direction:z.enum(['incoming','outgoing','all']).default('all'),blockFrom:z.number().int().nonnegative().safe().optional(),blockTo:z.number().int().nonnegative().safe().optional()}).strict();
export async function POST(request:Request){try{
 checkOrigin(request);owner(request);
 if(!request.headers.get('Content-Type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415});
 const raw=await request.text();if(new TextEncoder().encode(raw).length>4096)return Response.json({error:'Request too large.'},{status:413});
 const input=await importChainData(request,query.parse(JSON.parse(raw)));
 return Response.json({input,sourceHash:sourceCommitment(input.source),evidence:'trusted-rpc-finalized-logs',warning:'Read-only Ethereum mainnet data. Escrow and service fees use the selected payment network. Cent displays round down per transfer; source amounts retain all six decimals.'},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiFailure(error,'runtime');}}
