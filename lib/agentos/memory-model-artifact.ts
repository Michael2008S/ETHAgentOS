/** Official multilingual embedding artifact, pinned to its repository revision and LFS digest. */
export const MEMORY_MODEL_ARTIFACT={repository:'Qwen/Qwen3-Embedding-0.6B-GGUF',revision:'370f27d7550e0def9b39c1f16d3fbaa13aa67728',filename:'Qwen3-Embedding-0.6B-Q8_0.gguf',bytes:639150592,sha256:'06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439'};
export const LOCAL_MEMORY_MODEL={url:'http://127.0.0.1:11437/v1/embeddings',model:'qwen3-embedding-0.6b',revision:MEMORY_MODEL_ARTIFACT.sha256,timeoutMs:60000,inputDimensions:1024,dimensions:256};
