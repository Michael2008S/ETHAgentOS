import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';

/** Private, durable journals. Public APIs return explicitly selected evidence only. */
export class Journal {
 constructor(path=':memory:'){
  if(path!==':memory:'){mkdirSync(dirname(path),{recursive:true,mode:0o700});}
  this.db=new DatabaseSync(path);
  if(path!==':memory:')chmodSync(path,0o600);
  this.db.exec('PRAGMA busy_timeout=5000;');
  this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS records(namespace TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(namespace,id));');
 }
 get(namespace,id){const row=this.db.prepare('SELECT data FROM records WHERE namespace=? AND id=?').get(namespace,id);return row?JSON.parse(row.data):undefined;}
 put(namespace,id,value){this.db.prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(namespace,id) DO UPDATE SET data=excluded.data').run(namespace,id,JSON.stringify(value));return value;}
 entries(namespace){return this.db.prepare('SELECT id,data FROM records WHERE namespace=? ORDER BY id').all(namespace).map(r=>({id:r.id,value:JSON.parse(r.data)}));}
 rows(namespace){return this.db.prepare('SELECT data FROM records WHERE namespace=? ORDER BY id').all(namespace).map(r=>JSON.parse(r.data));}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(error){this.db.exec('ROLLBACK');throw error;}}
 close(){if(this.db.isOpen)this.db.close();}
}
