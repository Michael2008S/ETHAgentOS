'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { isLanguage, LANGUAGE_KEY, translate, type Language } from './translate';
type LocaleContext = { language: Language; setLanguage: (next: Language) => void; tr: (text: string) => string };
const Context = createContext<LocaleContext | null>(null);
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<Language>('zh-CN');
  useEffect(() => {
    try { const saved = localStorage.getItem(LANGUAGE_KEY); if (isLanguage(saved)) updateLanguage(saved); } catch { /* Storage may be disabled. */ }
    const sync = (event: StorageEvent) => { if (event.key === LANGUAGE_KEY && isLanguage(event.newValue)) updateLanguage(event.newValue); };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = language === 'zh-CN' ? 'AgentOS — 任务总览' : 'AgentOS — Mission Control';
  }, [language]);
  const setLanguage = useCallback((next: Language) => {
    updateLanguage(next);
    try { localStorage.setItem(LANGUAGE_KEY, next); } catch { /* Switching still works without storage. */ }
  }, []);
  const tr = useCallback((text: string) => translate(language, text), [language]);
  return <Context.Provider value={{ language, setLanguage, tr }}>{children}</Context.Provider>;
}
export function useLanguage() {
  const context = useContext(Context);
  if (!context) throw new Error('LanguageProvider is required');
  return context;
}
export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  return <div className="language-switcher" role="group" aria-label="语言 / Language">
    <button type="button" lang="zh-CN" aria-label="切换为中文" aria-pressed={language === 'zh-CN'} onClick={() => setLanguage('zh-CN')}>中文</button>
    <button type="button" lang="en" aria-label="Switch to English" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
  </div>;
}
