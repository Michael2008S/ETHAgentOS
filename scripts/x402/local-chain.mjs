import {startX402Stack} from './local-stack.mjs';
const stack=await startX402Stack({root:process.env.AGENTOS_X402_STATE,implementation:process.env.AGENTOS_X402_IMPLEMENTATION??'reference',appOrigin:process.env.AGENTOS_APP_ORIGIN,chainPort:Number(process.env.AGENTOS_CHAIN_PORT),supplierPort:Number(process.env.AGENTOS_X402_SUPPLIER_PORT),facilitatorPort:Number(process.env.AGENTOS_X402_FACILITATOR_PORT),reportPort:Number(process.env.AGENTOS_X402_REPORT_PORT)});
console.log('Local x402 runtime ready '+JSON.stringify({chain:stack.chain.base,supplier:stack.supplier.base,report:stack.report.base,facilitator:stack.facilitator.base,policy:stack.policy}));
let closing=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{if(closing)return;closing=true;await stack.close();});
