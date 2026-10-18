import { env } from 'cloudflare:workers';
import { createModelPlanner,parseModelConfiguration } from './model';
import { DomainError } from './engine';
export async function configuredPlanner(request:Request){
  const local=Boolean(import.meta.env.DEV)&&['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname);
  let source:unknown;
  try{source=env.AGENTOS_MODEL_CONFIGURATION?JSON.parse(env.AGENTOS_MODEL_CONFIGURATION):local?{url:'http://127.0.0.1:11435/v1/chat/completions',model:'qwen2.5-0.5b-instruct',revision:'74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db'}:null;}catch{throw new DomainError('Model configuration is unavailable.','UNAVAILABLE');}
  if(!source)throw new DomainError('Model service is not configured.','UNAVAILABLE');
  return createModelPlanner(parseModelConfiguration(source,local),env.AGENTOS_MODEL_API_KEY);
}
