import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';import {serialize,deserialize} from 'node:v8';
/** Local-only binary journal, preserving BigInt without accepting JSON type tags. */
export function readLocalState(path,fallback){return path&&existsSync(path)?deserialize(readFileSync(path)):fallback;}
export function writeLocalState(path,value){if(!path)return;mkdirSync(dirname(path),{recursive:true,mode:0o700});const temporary=path+'.'+process.pid+'.tmp';writeFileSync(temporary,serialize(value),{mode:0o600,flush:true});renameSync(temporary,path);}
export function localMap(path){const map=new Map(readLocalState(path,[]));return {map,flush:()=>writeLocalState(path,[...map])};}
