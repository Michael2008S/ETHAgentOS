import type { Command, Scenario, Task, TaskInput, Workspace } from '../lib/agentos/types.ts';
export class AgentOSClient {
  baseURL: string;
  constructor(baseURL='', privateHeaders: Record<string,string>={}) { this.baseURL=baseURL; this.headers=privateHeaders; }
  private headers: Record<string,string>;
  private async request(path:string,command?:Command,post=false):Promise<{state:Workspace;revision:number}> {
    const res=await fetch(this.baseURL+path,{method:command||post?'POST':'GET',headers:{'Content-Type':'application/json',...this.headers},credentials:'include',...(command?{body:JSON.stringify(command)}:{})});
    const data=await res.json() as {state:Workspace;revision:number;error?:string};if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`);return data;
  }
  async workspace(){return (await this.request('/api/workspace')).state;}
  async createTask(input:{agentId:string;title:string;budget:number;input?:TaskInput;timeoutSeconds?:number;scenario?:Scenario;requestId?:string}) {
    const requestId=input.requestId||crypto.randomUUID();const {state}=await this.request('/api/command',{...input,scenario:input.scenario||'success',type:'create_task',requestId,taskId:requestId});return state.tasks.find(t=>t.requestId===requestId)!;
  }
  async run(taskId:string,options:{timeoutMs?:number;pollMs?:number}={}):Promise<Task> {
    const deadline=Date.now()+(options.timeoutMs??30000),pollMs=options.pollMs??250;
    if(pollMs<10||pollMs>5000||!Number.isFinite(pollMs))throw new Error('Poll interval must be 10–5000ms.');
    while(Date.now()<deadline){const s=await this.workspace();const task=s.tasks.find(t=>t.id===taskId);if(!task)throw new Error('Task not found');if(!['queued','running'].includes(task.status))return task;await new Promise(resolve=>setTimeout(resolve,pollMs));}
    throw new Error('Timed out waiting for server execution; the durable task is retained.');
  }
  async recover(){return this.request('/api/runtime',undefined,true);}
  async resume(taskId:string){await this.request('/api/command',{type:'resume_task',taskId});return this.run(taskId);}
  async cancel(taskId:string){return this.request('/api/command',{type:'cancel_task',taskId});}
  async updateAgent(agentId:string,settings:{enabled:boolean;price:number}){return this.request('/api/command',{type:'update_agent',agentId,...settings});}
}
