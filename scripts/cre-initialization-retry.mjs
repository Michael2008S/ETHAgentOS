// Retry only the observed pre-execution organization lookup outage. Never hide
// workflow failures, delivery assertions, missing credentials or generated reports.
export function transientCREInitialization(result){
 return result.code!==0&&/unable to retrieve organization info/i.test(result.output)&&!/Delivery consensus:|CRE report generated|Workflow execution started/i.test(result.output);
}
export async function retryCREInitialization(run,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onRetry=()=>{}}={}){
 const attempts=[];
 for(let attempt=1;attempt<=3;attempt++){
  const result=await run(attempt);attempts.push({attempt,...result});
  if(!transientCREInitialization(result)||attempt===3)return {...result,attempts};
  onRetry(attempt);await wait(attempt*2000);
 }
}
