'use client';
import { useEffect,useEffectEvent,useRef,type FormHTMLAttributes } from 'react';
export const draftKey=(scope:string)=>'agentos.draft.v1:'+scope;
export function DraftForm({storageKey,onRestore,serialize,...props}:FormHTMLAttributes<HTMLFormElement>&{storageKey:string;onRestore?:(fields:Record<string,string>)=>void;serialize?:(fields:Record<string,string>)=>Record<string,string>}){
 const ref=useRef<HTMLFormElement>(null);
 const restoreDraft=useEffectEvent((fields:Record<string,string>)=>onRestore?.(fields));
 const serializeDraft=useEffectEvent((fields:Record<string,string>)=>serialize?.(fields)??fields);
 useEffect(()=>{
  const form=ref.current;if(!form)return;let saved:Record<string,string>={};
  try{const raw=sessionStorage.getItem(draftKey(storageKey));if(raw&&raw.length<=65536){const value=JSON.parse(raw);if(value&&typeof value==='object'&&!Array.isArray(value))saved=Object.fromEntries(Object.entries(value).filter(([key,v])=>/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)&&typeof v==='string')) as Record<string,string>;}}catch{}
  restoreDraft(saved);const restored=new WeakSet<Element>();
  const restore=()=>{for(const element of Array.from(form.elements)){if(restored.has(element))continue;restored.add(element);if(element instanceof HTMLInputElement||element instanceof HTMLSelectElement||element instanceof HTMLTextAreaElement){if(element.name in saved&&element.type!=='file'&&element.type!=='password')element.value=saved[element.name];}}};
  restore();const observer=new MutationObserver(restore);observer.observe(form,{childList:true,subtree:true});
  let timer:ReturnType<typeof setTimeout>;
  const persist=()=>{clearTimeout(timer);timer=setTimeout(()=>{saved=serializeDraft(Object.fromEntries(Array.from(new FormData(form).entries()).filter((entry):entry is [string,string]=>typeof entry[1]==='string')));try{const raw=JSON.stringify(saved);if(raw.length<=65536)sessionStorage.setItem(draftKey(storageKey),raw);}catch{}},0);};
  form.addEventListener('input',persist);form.addEventListener('change',persist);form.addEventListener('click',persist);
  return()=>{clearTimeout(timer);observer.disconnect();form.removeEventListener('input',persist);form.removeEventListener('change',persist);form.removeEventListener('click',persist);};
 },[storageKey]);
 return <form {...props} ref={ref}/>;
}
