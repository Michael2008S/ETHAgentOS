declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AGENTOS_CHAIN_CONFIGURATION?: string;
  }
}
