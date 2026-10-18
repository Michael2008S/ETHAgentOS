'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { isLanguage, LANGUAGE_KEY, translate, type Language } from './translate';
import { LanguageContext, useLanguage } from './context';
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
  return <LanguageContext.Provider value={{ language, setLanguage, tr }}>{children}</LanguageContext.Provider>;
}
export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  return <div className="language-switcher" role="group" aria-label="语言 / Language">
    <button type="button" lang="zh-CN" aria-label="切换为中文" aria-pressed={language === 'zh-CN'} onClick={() => setLanguage('zh-CN')}>中文</button>
    <button type="button" lang="en" aria-label="Switch to English" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
  </div>;
}
