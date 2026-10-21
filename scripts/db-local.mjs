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
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',process.env.AGENTOS_DEV_STATE_DIRECTORY||'.wrangler/state','--file',path],{stdio:'inherit'});
    child.on('error',reject);child.on('close',resolve);
  });process.exitCode=code??1;
} finally { await rm(directory,{recursive:true,force:true}); }
