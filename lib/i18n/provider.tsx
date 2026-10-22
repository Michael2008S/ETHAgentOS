'use client';
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { isLanguage, LANGUAGE_KEY, translate, type Language } from './translate';
import { LanguageContext, useLanguage } from './context';
const subscribeLanguage=(listener:()=>void)=>{
  const sync=(event:StorageEvent)=>{if(event.key===LANGUAGE_KEY||event.key===null)listener();};
  window.addEventListener('storage',sync);window.addEventListener('agentos-language',listener);
  return()=>{window.removeEventListener('storage',sync);window.removeEventListener('agentos-language',listener);};
};
const storedLanguage=()=>{try{const saved=localStorage.getItem(LANGUAGE_KEY);return isLanguage(saved)?saved:null;}catch{return null;}};
const serverLanguage=()=>null;
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [preferredLanguage, updateLanguage] = useState<Language|null>(null);
  const savedLanguage=useSyncExternalStore(subscribeLanguage,storedLanguage,serverLanguage);
  const language=preferredLanguage??savedLanguage??'zh-CN';
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = language === 'zh-CN' ? 'AgentOS — 任务总览' : 'AgentOS — Mission Control';
  }, [language]);
  const setLanguage = useCallback((next: Language) => {
    try { localStorage.setItem(LANGUAGE_KEY, next); updateLanguage(null); window.dispatchEvent(new Event('agentos-language')); } catch { updateLanguage(next); }
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
