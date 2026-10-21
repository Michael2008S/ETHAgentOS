/** Official Qwen artifact, pinned to repository revision and LFS SHA-256. */
export const WORKFLOW_MODEL_ARTIFACT={
 repository:'Qwen/Qwen2.5-3B-Instruct-GGUF',
 revision:'7dabda4d13d513e3e842b20f0d435c732f172cbe',
 filename:'qwen2.5-3b-instruct-q4_k_m.gguf',
 bytes:2104932768,
 sha256:'626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d',
};
export const LOCAL_WORKFLOW_MODEL={url:'http://127.0.0.1:11436/v1/chat/completions',model:'qwen2.5-3b-instruct',revision:WORKFLOW_MODEL_ARTIFACT.sha256,timeoutMs:60000,maxTokens:512};
