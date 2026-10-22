/** Bounded GET-only probes; never retry authorizations, payments or other writes. */
export class AcceptanceProbeUnavailable extends Error{constructor(kind,status,causeCode){super('Acceptance read unavailable: '+kind+(status?' '+status:''));this.kind=kind;this.status=status;this.causeCode=causeCode;}}
export async function readAcceptanceJSON(url,headers={},options={}){
 const request=options.request??fetch,delay=options.delay??(ms=>new Promise(r=>setTimeout(r,ms)));let last;
 for(let attempt=0;attempt<3;attempt++){
  try{let response;try{response=await request(url,{method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(10000)});}catch(error){throw new AcceptanceProbeUnavailable('transport',undefined,error?.cause?.code);}
   if(!response.ok){await response.body?.cancel();if(response.status===429||response.status>=500)throw new AcceptanceProbeUnavailable('http',response.status);throw Error('Acceptance read refused: HTTP '+response.status);}
   try{return await response.json();}catch(error){if(error instanceof SyntaxError)throw error;throw new AcceptanceProbeUnavailable('body',undefined,error?.cause?.code);}
  }catch(error){if(!(error instanceof AcceptanceProbeUnavailable))throw error;last=error;options.onRetry?.({attempt:attempt+1,kind:error.kind,status:error.status,causeCode:error.causeCode});if(attempt<2)await delay(1000*(attempt+1));}
 }
 throw last;
}
