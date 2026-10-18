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

/** Fault injection for isolated local integration tests; ignored by hosted requests. */
export function deferInline(request: Request) {
  return import.meta.env?.DEV && isLoopback(new URL(request.url)) && request.headers.has('x-agentos-sandbox') && request.headers.get('x-agentos-queue-only') === '1';
}

/** A private service caller may drain only already-authorized, server-selected jobs. */
export function drainScope(request: Request, privateOrigin?: string) {
  checkOrigin(request);
  const url = new URL(request.url);
  if (isLoopback(url)) return owner(request);
  // The Sites gateway enforces owner-private access, including service access.
  // Keep this opt-in disabled if the Site's audience changes.
  if (!privateOrigin || url.protocol !== 'https:' || url.origin !== privateOrigin || request.headers.has('x-agentos-sandbox')) throw new DomainError('Private runtime drain is not configured.', 'FORBIDDEN');
  return undefined;
}
