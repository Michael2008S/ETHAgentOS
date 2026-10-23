import{mkdir,open,readFile,unlink}from'node:fs/promises';import{dirname}from'node:path';
/** Refuse live owners; never break another operation's lock after a timeout. */
export async function withOperationLock(path,run){
 await mkdir(dirname(path),{recursive:true,mode:0o700});let file;
 for(let i=0;i<2;i++){try{file=await open(path,'wx',0o600);break;}catch(error){if(error.code!=='EEXIST')throw error;const old=JSON.parse(await readFile(path,'utf8'));try{process.kill(old.pid,0);throw Error('Another baseline lifecycle operation is active.');}catch(e){if(e.code!=='ESRCH')throw e;}await unlink(path);}}
 if(!file)throw Error('Baseline lifecycle lock unavailable.');const nonce=crypto.randomUUID();await file.writeFile(JSON.stringify({pid:process.pid,nonce,at:new Date().toISOString()}));await file.sync();
 try{return await run();}finally{await file.close();try{if(JSON.parse(await readFile(path,'utf8')).nonce===nonce)await unlink(path);}catch(error){if(error.code!=='ENOENT')throw error;}}
}
