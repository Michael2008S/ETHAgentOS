import evidenceWorker from './worker.ts';
import {d1EvidenceBucket} from './d1-bucket.ts';
type Environment={DB:D1Database;WRITE_TOKEN:string;PUBLIC_ORIGIN:string;ESCROW_ADDRESS:string};
/** Same public protocol, primary D1 reads and atomic SQL CAS instead of R2. */
const d1EvidenceWorker={fetch(request:Request,env:Environment){
 return evidenceWorker.fetch(request,{...env,BUCKET:d1EvidenceBucket(env.DB) as unknown as R2Bucket});
}};

export default d1EvidenceWorker;
