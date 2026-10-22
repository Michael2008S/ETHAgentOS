import {mkdir,readFile,writeFile,link,unlink,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';

/** A receipt identity, never a funded buyer or executor wallet. */
export async function pluginDeliverySigner(directory){
 const root=resolve(directory);await mkdir(root,{recursive:true,mode:0o700});const file=root+'/.delivery-signer.key';
 try{await lstat(file);}catch(error){if(error.code!=='ENOENT')throw error;const temporary=file+'.'+crypto.randomUUID()+'.tmp';await writeFile(temporary,generatePrivateKey(),{mode:0o600,flag:'wx'});try{await link(temporary,file);}catch(error){if(error.code!=='EEXIST')throw error;}finally{await unlink(temporary);}}
 const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('Plugin delivery identity must be a private regular file.');
 const key=await readFile(file,'utf8');if(!/^0x[0-9a-f]{64}$/.test(key))throw Error('Plugin delivery identity is invalid; no key was replaced.');return privateKeyToAccount(key);
}
