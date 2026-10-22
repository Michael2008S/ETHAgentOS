import {existsSync,renameSync,writeFileSync} from 'node:fs';
/** Explicit opt-in fault injection for persistent local acceptance instances only. */
export function crashAfterLocalFunding(directory,evidence){
 if(process.env.AGENTOS_LOCAL_CRASH_TESTS!=='1'||!directory)return;
 const armed=directory+'/crash-after-funding.once';if(!existsSync(armed))return;
 renameSync(armed,armed+'.consumed');writeFileSync(directory+'/crash-after-funding.json',JSON.stringify({...evidence,at:new Date().toISOString(),pid:process.pid}),{mode:0o600,flush:true});process.kill(process.pid,'SIGKILL');
}
