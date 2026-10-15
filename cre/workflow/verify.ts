import {keccak256,stringToHex,type Hex} from 'viem';
export type DeliverySpec={datasetUrl:string;datasetHash:Hex;artifactUrl:string};
export function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value);
}
export const specHash=(spec:DeliverySpec)=>keccak256(stringToHex(canonical(spec)));
export function verifyDelivery(datasetText:string,artifactText:string,taskId:Hex,expectedDatasetHash:Hex){
 if(keccak256(stringToHex(datasetText))!==expectedDatasetHash)throw new Error('Evidence bytes do not match buyer commitment');
 const rows:unknown=JSON.parse(datasetText);if(!Array.isArray(rows)||rows.length>10000)throw new Error('Invalid evidence');
 let total=0;for(const row of rows){if(!row||!Number.isSafeInteger(row.cents)||row.cents<0)throw new Error('Invalid amount');total+=row.cents;if(!Number.isSafeInteger(total))throw new Error('Unsafe aggregate');}
 const artifact=JSON.parse(artifactText);
 const accepted=!!artifact&&artifact.taskId===taskId&&artifact.totalCents===total&&artifact.transferCount===rows.length;
 return {accepted,outputHash:keccak256(stringToHex(canonical(artifact)))};
}
