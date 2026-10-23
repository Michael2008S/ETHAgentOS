import test from 'node:test';import assert from 'node:assert/strict';import{DatabaseSync}from'node:sqlite';import{spawn}from'node:child_process';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';
test('journal waits for another process initializing the database before switching to WAL',async()=>{
 const root=await mkdtemp(tmpdir()+'/agentos-journal-lock-'),path=root+'/db.sqlite',db=new DatabaseSync(path);let child;
 try{db.exec('BEGIN EXCLUSIVE; CREATE TABLE initializing(id INTEGER);');
 const code="import{Journal}from'./scripts/x402/storage.mjs';console.log('opening');const j=new Journal(process.argv[1]);j.put('test','id',{ok:true});j.close();";
 child=spawn(process.execPath,['--input-type=module','-e',code,path],{stdio:['ignore','pipe','pipe']});let output='';child.stderr.on('data',b=>{output+=b;});const done=new Promise((ok,no)=>{child.once('error',no);child.once('close',exit=>exit===0?ok():no(Error(output)));});
 await new Promise(ok=>child.stdout.once('data',ok));await new Promise(ok=>setTimeout(ok,200));db.exec('COMMIT');await done;assert.equal(db.prepare('SELECT data FROM records').get().data,'{"ok":true}');
 }finally{try{db.exec('ROLLBACK');}catch{}db.close();if(child?.exitCode===null)child.kill('SIGTERM');await rm(root,{recursive:true,force:true});}
});
