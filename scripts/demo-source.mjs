import {execFileSync} from 'node:child_process';import {mkdir,readFile,writeFile,symlink,rm,lstat} from 'node:fs/promises';import {resolve,join,dirname,sep} from 'node:path';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
/** Snapshot application source only; never copy credentials, Git metadata or runtime state. */
export async function syncDemoSource(destination){
 const base=resolve('.sites-runtime/isolated-demo'),target=resolve(destination);if(!target.startsWith(base+sep)||!target.endsWith(sep+'source'))throw new Error('Only an owned isolated-demo source directory may be synchronized.');
 await mkdir(target,{recursive:true});const paths=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))].sort();
 const digest=createHash('sha256');const copied=[];
 for(const path of paths){
  if(['.git/','.sites-runtime/','node_modules/','outputs/','.aws/','.agents/','.codex/','.wrangler/'].some(prefix=>path.startsWith(prefix))||path.startsWith('.dev.vars')||/\.(pem|key|p12)$/.test(path)||path.startsWith('.env')&&path!=='.env.example')continue;
  try{if((await lstat(path)).isSymbolicLink())continue;}catch(error){if(error.code==='ENOENT')continue;throw error;}
  let bytes;try{bytes=await readFile(path);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  digest.update(path+'\0').update(bytes);const output=join(target,path);await mkdir(dirname(output),{recursive:true});let same=false;try{same=(await readFile(output)).equals(bytes);}catch(error){if(error.code!=='ENOENT')throw error;}if(!same)await writeFile(output,bytes);copied.push(path);
 }
 const recordFile=join(dirname(target),'source-files.json');let previous=[];try{previous=JSON.parse(await readFile(recordFile,'utf8'));}catch{}
 for(const path of previous)if(!copied.includes(path)&&!path.includes('..')&&!path.startsWith('/'))await rm(join(target,path),{force:true});
 await writeFile(recordFile,JSON.stringify(copied));try{await symlink(resolve('node_modules'),join(target,'node_modules'),'dir');}catch(error){if(error.code!=='EEXIST')throw error;}
 const metadata={sourceRoot:target,parentCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDigest:digest.digest('hex'),files:copied.length};await writeFile(join(dirname(target),'source.json'),JSON.stringify(metadata,null,2));return metadata;
}
/** Resume exactly the approved source; never replace a running business runtime with current checkout code. */
export async function verifyDemoSource(destination){
 const base=resolve('.sites-runtime/isolated-demo'),target=resolve(destination);if(!target.startsWith(base+sep)||!target.endsWith(sep+'source'))throw Error('Select an owned isolated source snapshot.');
 const metadata=JSON.parse(await readFile(join(dirname(target),'source.json'),'utf8')),paths=JSON.parse(await readFile(join(dirname(target),'source-files.json'),'utf8'));if(metadata.sourceRoot!==target||!Array.isArray(paths)||paths.length!==metadata.files||new Set(paths).size!==paths.length)throw Error('Source snapshot manifest differs.');
 const hash=createHash('sha256');for(const path of paths){if(typeof path!=='string'||path.startsWith('/')||path.split('/').some(p=>['..','.git','node_modules'].includes(p))||(await lstat(join(target,path))).isSymbolicLink())throw Error('Unsafe source snapshot entry.');hash.update(path+'\0').update(await readFile(join(target,path)));}
 if(hash.digest('hex')!==metadata.sourceDigest)throw Error('Pinned source snapshot changed. Preserve it and review a separate runtime.');return metadata;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const arg=process.argv[2]||'.sites-runtime/isolated-demo/current.json',runtime=JSON.parse(await readFile(arg,'utf8'));console.log(JSON.stringify(await syncDemoSource(runtime.sourceSnapshot||runtime.sourceRoot)));}
