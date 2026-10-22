import {resolve,sep} from 'node:path';
/** Local acceptance only: keep Vite's project tooling while fixing the application source root. */
/** @returns {import('vite').Plugin[]} */
export function isolatedSource(raw=process.env.AGENTOS_PINNED_WEB_SOURCE){
 if(!raw)return [];
 const source=resolve(raw),base=resolve('.sites-runtime/isolated-demo');if(!source.startsWith(base+sep)||!source.endsWith(sep+'source'))throw Error('Pinned preview requires an owned source snapshot.');
 return [{name:'agentos-pinned-preview-source',enforce:'pre',config(){return {root:source};},configResolved(config){config.server.fs.allow=[source,resolve('node_modules'),resolve('build')];config.server.fs.strict=true;config.server.fs.deny=[...config.server.fs.deny.filter(p=>p!=='**/.sites-runtime/**'),source+'/.sites-runtime/**',source+'/.wrangler/**'];config.server.watch.ignored=(Array.isArray(config.server.watch.ignored)?config.server.watch.ignored:[]).filter(p=>p!=='**/.sites-runtime/**');}}];
}
