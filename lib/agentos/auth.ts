import { DomainError } from './engine.ts';

export const isLoopback = (url: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

/** Hosted identity is supplied by the trusted Sites gateway, never by a public API key. */
export function owner(request: Request): string {
  const local = isLoopback(new URL(request.url));
  const user = request.headers.get('oai-authenticated-user-id');
  if (!user && !local) throw new DomainError('Sign in to access your workspace.', 'UNAUTHORIZED');
  const identity = user || 'local-demo';
  const sandbox = request.headers.get('x-agentos-sandbox');
  if (sandbox !== null) {
    if (!local) throw new DomainError('Test workspaces are only available on loopback.', 'FORBIDDEN');
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(sandbox)) throw new DomainError('Invalid test workspace.');
    return `${identity}:sandbox:${sandbox}`;
  }
  return identity;
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new DomainError('Cross-origin writes are not allowed.', 'FORBIDDEN');
}
