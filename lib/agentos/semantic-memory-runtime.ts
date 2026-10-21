import {env} from 'cloudflare:workers';
import {parseEmbeddingConfiguration,embeddingDescriptor} from './memory-embedding';
import {LOCAL_MEMORY_MODEL} from './memory-model-artifact';
export async function configuredMemoryModel(request:Request){
 const local=Boolean(import.meta.env.DEV)&&['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname),configuration=parseEmbeddingConfiguration(env.AGENTOS_MEMORY_MODEL_CONFIGURATION?JSON.parse(env.AGENTOS_MEMORY_MODEL_CONFIGURATION):local?LOCAL_MEMORY_MODEL:null,local);return {configuration,descriptor:await embeddingDescriptor(configuration),key:env.AGENTOS_MEMORY_MODEL_API_KEY};
}
