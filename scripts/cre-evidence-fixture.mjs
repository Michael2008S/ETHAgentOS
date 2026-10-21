import {keccak256,stringToHex} from 'viem';
import {canonical,specHash} from '../cre/workflow/verify.ts';

class FixtureFailure extends Error{constructor(stage,retryable,message){super(message);this.stage=stage;this.retryable=retryable;}}
async function boundedText(response){
 const reader=response.body?.getReader();if(!reader)throw new FixtureFailure('response',false,'Synthetic evidence response is empty.');let text='',size=0;const decoder=new TextDecoder();
 try{for(;;){const {done,value}=await reader.read();if(done)break;if((size+=value.length)>131072){await reader.cancel();throw new FixtureFailure('response',false,'Synthetic evidence response exceeds its size limit.');}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}finally{reader.releaseLock();}
}
/** CLI acceptance fixture only. Writes synthetic bytes to an owned ephemeral evidence service. */
export async function publishCREFixture(fixture,escrow,bytes,artifactText,{request=fetch,pause=ms=>new Promise(done=>setTimeout(done,ms))}={}){
 const origin=new URL(fixture.origin);if(origin.protocol!=='https:'||origin.origin!==fixture.origin||!/^0x[0-9a-fA-F]{40}$/.test(escrow)||typeof fixture.token!=='string'||fixture.token.length<32)throw Error('Synthetic evidence fixture is not configured.');
 if(keccak256(stringToHex(bytes.datasetText))!==bytes.datasetHash||JSON.parse(artifactText)?.taskId!==bytes.id)throw Error('Synthetic evidence bytes differ from the intended task.');
 const namespace='/v1/11155111/'+escrow.toLowerCase(),spec={datasetUrl:fixture.origin+namespace+'/dataset/'+bytes.datasetHash,artifactUrl:fixture.origin+namespace+'/artifact/'+bytes.id,datasetHash:bytes.datasetHash,verification:bytes.verification},requests=[];
 async function exchange(stage,path,body,expected){
  for(let attempt=1;attempt<=3;attempt++){
   try{
    let response;try{response=await request(fixture.origin+path,{method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(20000),...(body?{headers:{'Content-Type':'application/json',Authorization:'Bearer '+fixture.token},body:JSON.stringify({chainId:11155111,escrow:escrow.toLowerCase(),...body})}:{})});}catch{throw new FixtureFailure(stage,true,'Synthetic HTTPS evidence transport is unavailable.');}
    if(!response.ok){await response.body?.cancel();throw new FixtureFailure(stage,[408,429].includes(response.status)||response.status>=500,'Synthetic evidence request failed with HTTP '+response.status+'.');}
    let text;try{text=await boundedText(response);}catch(error){if(error instanceof FixtureFailure)throw error;throw new FixtureFailure(stage,true,'Synthetic evidence response was interrupted.');}
    let matches=false;if(typeof expected==='string')matches=text===expected;else try{matches=canonical(JSON.parse(text))===canonical(expected);}catch{}
    if(!matches)throw new FixtureFailure(stage,false,'Synthetic evidence differs from the exact committed bytes or specification.');
    requests.push({stage,attempt,outcome:'verified',status:response.status});return;
   }catch(error){requests.push({stage,attempt,outcome:error instanceof FixtureFailure&&error.retryable?'unavailable':'rejected'});if(!(error instanceof FixtureFailure)||!error.retryable||attempt===3)throw new Error('CRE evidence fixture '+stage+' failed after '+attempt+' attempt(s). '+(error instanceof FixtureFailure?error.message:'Publication could not be verified.'));await pause(250*2**(attempt-1));}
  }
 }
 await exchange('input-publication','/v1/drafts',{id:bytes.id,datasetText:bytes.datasetText,verification:bytes.verification},{spec});
 await exchange('input-readback',namespace+'/dataset/'+bytes.datasetHash,undefined,bytes.datasetText);
 await exchange('artifact-publication','/v1/artifacts',{id:bytes.id,specHash:specHash(spec),artifactText},{stored:true});
 await exchange('artifact-readback',namespace+'/artifact/'+bytes.id,undefined,artifactText);
 return {spec,requests};
}
