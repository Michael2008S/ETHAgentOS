'use client';
import { createContext, useContext } from 'react';
import type { Language } from './translate';

type LocaleContext = { language: Language; setLanguage: (next: Language) => void; tr: (text: string) => string };
// Keep context identity outside the dictionary/React Refresh dependency path.
// Existing providers and consumers must retain the same context during HMR.
export const LanguageContext = createContext<LocaleContext | null>(null);
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('LanguageProvider is required');
  return context;
}
