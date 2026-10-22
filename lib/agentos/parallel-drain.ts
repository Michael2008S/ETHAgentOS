/** Independent claims run together; each operation retains its own durable fences. */
export async function drainIndependent<T>(claim:()=>Promise<T|null>,execute:(job:T)=>Promise<void>,options={concurrency:2,maxJobs:4,budgetMs:20000}){
 const started=Date.now();let count=0;
 await Promise.all(Array.from({length:options.concurrency},async()=>{while(count<options.maxJobs&&Date.now()-started<options.budgetMs){count++;const job=await claim();if(!job)return;await execute(job);}}));
}
