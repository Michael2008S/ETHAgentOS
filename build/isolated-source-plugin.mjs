import {resolve,sep} from 'node:path';
/** Local acceptance only: fix application sources without exposing runtime data. */
/** @returns {import('vite').Plugin[]} */
export function isolatedSource(raw=process.env.AGENTOS_PINNED_WEB_SOURCE){
 if(!raw)return [];
 const source=resolve(raw),base=resolve('.sites-runtime/isolated-demo');if(!source.startsWith(base+sep)||!source.endsWith(sep+'source'))throw Error('Pinned preview requires an owned source snapshot.');
 return [{name:'agentos-pinned-preview-source',enforce:'pre',config(){return {root:source};}},{name:'agentos-pinned-preview-access',enforce:'post',config:{order:'post',handler(config){const server=config.server??={};const fs=server.fs??={};fs.allow=[source,resolve('node_modules')];fs.strict=true;fs.deny=[...(fs.deny??[]).filter(p=>p!=='**/.sites-runtime/**'),source+'/.sites-runtime/**',source+'/.wrangler/**'];const watch=server.watch??={};watch.ignored=(Array.isArray(watch.ignored)?watch.ignored:[]).filter(p=>p!=='**/.sites-runtime/**');}}}];
}
