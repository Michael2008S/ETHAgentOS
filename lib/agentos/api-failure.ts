import { z } from 'zod';
import { DomainError } from './engine.ts';

/** RPC errors may include authenticated URLs and request bodies. Never serialize them. */
export function apiFailure(error:unknown,kind:'runtime'|'chain') {
  const invalid=error instanceof SyntaxError||error instanceof z.ZodError;
  const status=error instanceof DomainError?({UNAUTHORIZED:401,FORBIDDEN:403,NOT_FOUND:404,CONFLICT:409,IDEMPOTENCY_CONFLICT:409,UNAVAILABLE:503}[error.code]??400):invalid?400:kind==='runtime'?503:502;
  const message=error instanceof DomainError?error.message:invalid?'Invalid JSON request.':kind==='runtime'?'Runtime temporarily unavailable. Durable checkpoints are retained. Retry after recovery.':'Onchain provider is unavailable. Retry the same reconciliation after recovery.';
  return Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
}
