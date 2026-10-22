declare global {interface ImportMetaEnv {readonly VITE_AGENTOS_CAPTURED_DATA_URL?:string}}
import {env} from 'cloudflare:workers';
import {DomainError} from './engine';
import {importTransfers,verifyTransferSource,type DataQuery} from './chain-data';
import type {TaskInput} from './types';
import {isLoopback} from './auth';
export function configuredDataReplay(request:Request){return !!(import.meta.env.DEV&&isLoopback(new URL(request.url))&&/^http:\/\/127\.0\.0\.1:\d+\/captured-usdc$/.test(import.meta.env.VITE_AGENTOS_CAPTURED_DATA_URL??''));}
export function configuredDataRpcURL(request:Request){
 const value=configuredDataReplay(request)?import.meta.env.VITE_AGENTOS_CAPTURED_DATA_URL:env.AGENTOS_DATA_RPC_URL||(import.meta.env.DEV&&isLoopback(new URL(request.url))?'https://ethereum-rpc.publicnode.com':undefined);
 if(!value)throw new DomainError('Ethereum data source is not configured.','UNAVAILABLE');return value;
}
export async function importChainData(request:Request,query:DataQuery){
 try{return await importTransfers(configuredDataRpcURL(request),query,fetch,undefined,configuredDataReplay(request));}catch(error){if(error instanceof DomainError)throw error;throw new DomainError('USDC import unavailable or range invalid. Use 1–25 transfers in a finalized range and retry.','UNAVAILABLE');}
}
export async function checkInputSource(request:Request,input?:TaskInput){
 if(!input?.source)return;
 try{await verifyTransferSource(configuredDataRpcURL(request),input.source,fetch,configuredDataReplay(request));}catch(error){if(error instanceof DomainError)throw error;const reason=error instanceof Error&&(/^(Data RPC (transport failed|HTTP failure|invalid response): (?:[0-9]+ )?eth_[a-zA-Z]+|Source events or canonical blocks have changed\.|The recorded finality checkpoint is no longer canonical\.)$/.test(error.message))?error.message:'Source verification unavailable.';throw new DomainError('USDC source could not be reverified. No new task was authorized. '+reason,'UNAVAILABLE');}
}
