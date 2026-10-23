declare global {interface ImportMetaEnv {readonly VITE_AGENTOS_LOCAL_CCIP_URL?:string;readonly VITE_AGENTOS_LOCAL_PLUGIN_URL?:string;readonly VITE_AGENTOS_LOCAL_CHAIN_URL?:string;readonly VITE_AGENTOS_LOCAL_SUPPLIER_URL?:string}}
/** Build-time, non-secret development configuration; never accepted from HTTP callers. */
export function loopbackService(value:string){
 const url=new URL(value);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Development services require a plain 127.0.0.1 HTTP origin.');return url.origin;
}
export function localServices(){return {
 ccip:loopbackService(import.meta.env?.VITE_AGENTOS_LOCAL_CCIP_URL||'http://127.0.0.1:11440'),
 plugins:loopbackService(import.meta.env?.VITE_AGENTOS_LOCAL_PLUGIN_URL||'http://127.0.0.1:11438'),
 chain:loopbackService(import.meta.env?.VITE_AGENTOS_LOCAL_CHAIN_URL||'http://127.0.0.1:8545'),
 supplier:loopbackService(import.meta.env?.VITE_AGENTOS_LOCAL_SUPPLIER_URL||'http://127.0.0.1:7461'),
};}
