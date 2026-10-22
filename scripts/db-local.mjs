import { mkdtemp,readFile,readdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
// First installation only. Existing databases apply only their missing migration.
const directory=await mkdtemp(join(tmpdir(),'agentos-schema-'));
try {
  const migrations=(await readdir('drizzle')).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
  const sql=(await Promise.all(migrations.map(name=>readFile(join('drizzle',name),'utf8')))).join('\n');
  const path=join(directory,'schema.sql');await writeFile(path,sql);
  // Native source snapshots intentionally omit build artifacts. D1 initialization
  // only needs the same binding identity used by the Vite local runtime.
  const hosting=JSON.parse(await readFile('.openai/hosting.json','utf8'));
  if(hosting.d1!=='DB')throw Error('Expected the local DB binding.');
  const config=join(directory,'wrangler.json');await writeFile(config,JSON.stringify({name:'agentos-local-db',compatibility_date:'2026-05-15',d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000'}]}));
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config',config,'--persist-to',process.env.AGENTOS_DEV_STATE_DIRECTORY||'.wrangler/state','--file',path],{stdio:'inherit'});
    child.on('error',reject);child.on('close',resolve);
  });process.exitCode=code??1;
} finally { await rm(directory,{recursive:true,force:true}); }
