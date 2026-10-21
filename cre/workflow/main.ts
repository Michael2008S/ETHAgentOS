import {CronCapability,handler,Runner} from '@chainlink/cre-sdk';
import {parseConfig,type Config} from './config.ts';
import {onCron} from './handler.ts';
export const initWorkflow=(config:Config)=>[handler(new CronCapability().trigger({schedule:config.schedule}),onCron)];
export async function main(){const runner=await Runner.newRunner<Config>({configParser:parseConfig});await runner.run(initWorkflow);}
