/** Implements only the conditional object-store operations used by the evidence protocol. */
type Row={key:string;body:string;etag:string};
type Conditions={onlyIf?:Headers|{etagMatches?:string}};
export function d1EvidenceBucket(database:D1Database){
 const object=(row:Row|null)=>row?{key:row.key,etag:row.etag,httpEtag:'"'+row.etag+'"',body:row.body,text:async()=>row.body}:null;
 return {
  async get(key:string){return object(await database.prepare('SELECT key,body,etag FROM evidence_objects WHERE key=?').bind(key).first<Row>());},
  async head(key:string){const row=await database.prepare('SELECT key,etag FROM evidence_objects WHERE key=?').bind(key).first<{key:string;etag:string}>();return row?{key:row.key,etag:row.etag,httpEtag:'"'+row.etag+'"'}:null;},
  async put(key:string,body:string,options:Conditions){
   const condition=options?.onlyIf,etag=crypto.randomUUID();let statement:D1PreparedStatement;
   if(condition instanceof Headers&&condition.get('If-None-Match')==='*')statement=database.prepare('INSERT OR IGNORE INTO evidence_objects(key,body,etag) VALUES(?,?,?)').bind(key,body,etag);
   else if(condition&&!(condition instanceof Headers)&&typeof condition.etagMatches==='string')statement=database.prepare('UPDATE evidence_objects SET body=?,etag=? WHERE key=? AND etag=?').bind(body,etag,key,condition.etagMatches);
   else throw Error('Unconditional evidence writes are forbidden.');
   const result=await statement.run();return result.meta.changes===1?{key,etag,httpEtag:'"'+etag+'"'}:null;
  },
 };
}
