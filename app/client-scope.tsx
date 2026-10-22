'use client';
import { useSyncExternalStore, type ReactNode } from 'react';
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Mount browser-persisted forms after hydration; key the child by its authority scope. */
export function ClientScope({ children }: { children: ReactNode }) {
  const ready = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return ready ? children : null;
}
