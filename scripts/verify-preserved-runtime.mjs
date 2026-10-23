import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {verifyDemoSource} from './demo-source.mjs';
import {pluginRecoveryRevision} from './recover-local-plugin.mjs';
import {verifyPreservedBackup} from './preserved-runtime-backup.mjs';
export function assertPreservedRows(before,after){const rows=new Map(after.map(r=>[r.owner_id,r]));for(const row of before)assert.deepEqual(rows.get(row.owner_id),row,'An original workspace was changed or removed.');return before.length;}
async function sqliteFiles(root){let result=[];for(const e of await readdir(root,{withFileTypes:true})){const p=join(root,e.name);if(e.isDirectory())result.push(...await sqliteFiles(p));else if(e.name.endsWith('.sqlite'))result.push(p);}return result;}
function workspaceRows(path){const db=new DatabaseSync(path,{readOnly:true});try{if(!db.prepare("SELECT name FROM sqlite_master WHERE name='agentos_workspaces'").get())return null;return db.prepare('SELECT owner_id,revision,data FROM agentos_workspaces ORDER BY owner_id').all();}finally{db.close();}}
export async function verifyPreservedRuntime(runtimePath,archive){
 const r=JSON.parse(await readFile(runtimePath,'utf8')),backup=await verifyPreservedBackup(archive),evidence=JSON.parse(await readFile(join(archive,'chain-evidence.json'),'utf8'));
 const before=evidence.runtime;
 assert.equal(r.root,before.root);assert.equal(r.chainURL,before.chainURL);assert.equal(r.componentRecovery.chainPid,before.componentRecovery.chainPid);
 const pid=execFileSync('lsof',['-nP','-iTCP:'+new URL(r.chainURL).port,'-sTCP:LISTEN','-Fp'],{encoding:'utf8'}).split('\n').find(s=>/^p\d+$/.test(s));assert.equal(Number(pid?.slice(1)),r.componentRecovery.chainPid,'The original in-memory chain listener must survive.');
 const services=[];for(const [name,field,path]of [['web','baseURL','/api/workspace'],['plugins','pluginURL','/health'],['chain','chainURL','/config'],['mcp','mcpURL','/health'],['supplier','supplierURL','/health'],['supplier2','supplier2URL','/health']]){const response=await fetch(r[field]+path,{signal:AbortSignal.timeout(15000)}),value=await response.json();assert.equal(response.status,200,name+' is unhealthy');if(name==='chain')assert.deepEqual(value,evidence.config);if(name==='plugins'){assert.equal(value.status,'ok');assert.equal(value.revision,await pluginRecoveryRevision(r.sourceSnapshot));}services.push({name,httpStatus:response.status});}
 const webSource=await verifyDemoSource(r.componentRecovery.source),pluginSource=await verifyDemoSource(r.sourceSnapshot);
 const files=execFileSync('git',['ls-files','-z','app','lib','sdk','components','hooks','cre/workflow','build','vite.config.ts','package.json','package-lock.json'],{encoding:'utf8'}).split('\0').filter(Boolean);const differences=[];
 for(const file of files)if(!(await readFile(file)).equals(await readFile(join(r.componentRecovery.source,file))))differences.push(file);
 assert.deepEqual(differences,[],'Current application code differs from the recovered web snapshot.');
 const live=(await Promise.all((await sqliteFiles(r.root+'/db')).map(workspaceRows))).find(Boolean),saved=(await Promise.all((await sqliteFiles(archive)).filter(p=>!p.includes('/runtime/')).map(workspaceRows))).find(Boolean);assert.ok(live&&saved);
 const preservedWorkspaces=assertPreservedRows(saved,live);
 const journal=r.root+'/plugins/journal',savedJournal=join(archive,'runtime/plugins/journal'),receipts=(await readdir(savedJournal)).filter(p=>p.endsWith('.json'));for(const p of [...receipts,'.delivery-signer.key'])assert.ok((await readFile(join(journal,p))).equals(await readFile(join(savedJournal,p))),'Original plugin identity or receipt changed.');
 const result={passed:true,checkedAt:new Date().toISOString(),harnessCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runtimeRoot:r.root,chainPid:r.componentRecovery.chainPid,chainConfigurationUnchanged:true,backup,services,webSource,pluginSource,applicationFilesCompared:files.length,applicationMatchesCheckout:true,preservedWorkspaces,preservedPluginReceipts:receipts.length,pluginSignerSha256:createHash('sha256').update(await readFile(join(journal,'.delivery-signer.key'))).digest('hex')};return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await verifyPreservedRuntime(process.argv[2],resolve(process.argv[3]));if(process.argv[4])await writeFile(process.argv[4],JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
