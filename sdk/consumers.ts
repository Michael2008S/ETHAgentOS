import type {ConsumerCredential} from '../lib/agentos/consumer-auth.ts';
/** Authenticated owner management. Returned tokens are shown once and never persisted by this SDK. */
export class AgentConsumerClient{
 readonly baseURL:string;readonly headers:Record<string,string>;
 constructor(baseURL='',headers:Record<string,string>={}){this.baseURL=baseURL;this.headers=headers;}
 private async call<T>(body?:unknown):Promise<T>{const response=await fetch(this.baseURL+'/api/runtime/consumers',{method:body?'POST':'GET',credentials:'include',headers:{'Content-Type':'application/json',...this.headers},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json() as T&{error?:string};if(!response.ok)throw new Error(value.error??'Consumer access is unavailable.');return value;}
 async list():Promise<ConsumerCredential[]>{return (await this.call<{credentials:ConsumerCredential[]}>()).credentials;}
 async issue(input:{name:string;ttlSeconds?:number;intervalMs?:number;id?:string}):Promise<{credential:ConsumerCredential;token:string}>{return this.call({action:'issue',id:input.id??crypto.randomUUID(),name:input.name,ttlSeconds:input.ttlSeconds??86400,intervalMs:input.intervalMs??5000});}
 async revoke(id:string):Promise<void>{await this.call({action:'revoke',id});}
}
