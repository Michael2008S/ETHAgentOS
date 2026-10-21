import {readFile} from 'node:fs/promises';
import {loopbackService} from '../lib/agentos/local-services.ts';
/** Explicit profile selection; default browser/CI startup remains unchanged. */
export async function browserRuntime(arguments_,read=path=>readFile(path,'utf8')){
 const args=[...arguments_],index=args.indexOf('--runtime');if(index<0)return {args,environment:{}};
 const path=args[index+1];if(!path||path.startsWith('--')||args.lastIndexOf('--runtime')!==index)throw Error('Browser runtime requires one saved runtime JSON path.');
 const runtime=JSON.parse(await read(path));if(runtime.identityEnabled!==true)throw Error('Browser regression requires an identity-enabled local runtime.');
 const base=loopbackService(runtime.baseURL),chain=loopbackService(runtime.chainURL),supplier=loopbackService(runtime.supplierURL),secondary=loopbackService(runtime.supplier2URL??'http://127.0.0.1:'+(Number(new URL(supplier).port)+1));
 args.splice(index,2);return {args,environment:{AGENTOS_TEST_URL:base,AGENTOS_CHAIN_URL:chain,AGENTOS_SUPPLIER_URL:supplier,AGENTOS_SECOND_SUPPLIER_URL:secondary}};
}
