import {readFile,writeFile,mkdir,readdir,lstat,copyFile,chmod} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {chmodSync} from 'node:fs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Copy private state without following links out of the selected runtime. */
export async function copyPrivateTree(source,target){
 const stat=await lstat(source);
 if(stat.isSymbolicLink())throw Error('Refusing a symlink in preserved runtime state.');
 if(stat.isDirectory()){await mkdir(target,{recursive:true,mode:0o700});await chmod(target,0o700);for(const name of await readdir(source)){if(name==='node_modules')continue;await copyPrivateTree(join(source,name),join(target,name));}}
 else if(stat.isFile()){await mkdir(dirname(target),{recursive:true,mode:0o700});await copyFile(source,target);await chmod(target,0o600);}
 else throw Error('Refusing a special file in preserved runtime state.');
}
async function entries(root,prefix=''){
 const result=[];for(const name of (await readdir(join(root,prefix))).sort()){const path=join(prefix,name);if(path==='manifest.json')continue;const stat=await lstat(join(root,path));if(stat.isSymbolicLink())throw Error('Archive contains a symlink.');if(stat.isDirectory())result.push(...await entries(root,path));else result.push({path,sha256:digest(await readFile(join(root,path)))});}return result;
}
export function sealArchiveDatabase(path){chmodSync(path,0o600);const db=new DatabaseSync(path);try{db.exec("PRAGMA journal_mode=DELETE");}finally{db.close();}}
export async function verifyPreservedBackup(root){
 const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
 if(JSON.stringify(await entries(root))!==JSON.stringify(manifest.entries))throw Error('Archive checksum or file inventory differs.');
 let databases=0;for(const row of manifest.entries)if(row.path.endsWith('.sqlite')){const db=new DatabaseSync(join(root,row.path),{readOnly:true});try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('SQLite integrity check failed.');databases++;}finally{db.close();}}
 return {verified:true,databases,files:manifest.entries.length,restorableChain:false};
}
export async function backupPreservedRuntime(runtimePath,destination){
 const r=JSON.parse(await readFile(runtimePath,'utf8')),root=resolve(destination);
 if(r.persistent||r.sourceRoot!==process.cwd()||!r.root.startsWith(resolve('.sites-runtime/isolated-demo')+'/'))throw Error('Select the owned preserved in-memory runtime.');
 for(const field of ['baseURL','chainURL','pluginURL']){const u=new URL(r[field]);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1')throw Error('Only loopback runtime backup is supported.');}
 const config=await(await fetch(r.chainURL+'/config')).json();
 execFileSync(process.execPath,['scripts/archive-legacy-runtime.mjs',resolve(runtimePath),root],{stdio:'pipe',timeout:300000});
 // Seal only the copied databases. Read-only verification must not create WAL sidecars.
 for(const name of await readdir(root))if(name.endsWith('.sqlite'))sealArchiveDatabase(join(root,name));
 for(const path of ['runtime.json','source.json','source-files.json','plugins','supplier','supplier2','source'])await copyPrivateTree(join(r.root,path),join(root,'runtime',path));
 if(r.componentRecovery){await copyPrivateTree(r.componentRecovery.source,join(root,'web-source'));for(const name of ['source.json','source-files.json'])await copyPrivateTree(join(dirname(r.componentRecovery.source),name),join(root,'web-'+name));}
 if(JSON.stringify(config)!==JSON.stringify(await(await fetch(r.chainURL+'/config')).json()))throw Error('Chain configuration changed during backup; preserve archive and inspect.');
 const evidence=JSON.parse(await readFile(join(root,'chain-evidence.json'),'utf8'));
 const check=await(await fetch(r.chainURL+'/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBlockByNumber',params:['0x'+evidence.head.toString(16),false]})})).json();
 if(check.result?.hash!==evidence.blocks.at(-1).hash)throw Error('Archived chain head no longer matches.');
 await writeFile(join(root,'manifest.json'),JSON.stringify({version:'agentos.preserved-runtime-backup.v1',createdAt:new Date().toISOString(),restorableChain:false,chainPid:r.componentRecovery?.chainPid,entries:await entries(root)},null,2),{mode:0o600});
 return {archive:root,...await verifyPreservedBackup(root),chainHead:evidence.head,receipts:evidence.receipts.length,chainConfigurationUnchanged:true,warning:'SQLite and private runtime files are backed up; the original in-memory EVM must remain running.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await backupPreservedRuntime(process.argv[2],process.argv[3])));
