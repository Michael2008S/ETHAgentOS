import {test,expect} from '@playwright/test';
import {encodeFunctionData,formatUnits,parseAbi} from 'viem';
import {AgentWalletSession,localWalletProvider} from '../../sdk/wallet.ts';
const base=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177',chain=process.env.AGENTOS_CHAIN_URL||'http://127.0.0.1:8545';
test.beforeAll(async()=>{
 const deployment=await(await fetch(chain+'/config')).json();if(deployment.mode!=='local'||deployment.chainId!==31337)throw new Error('Browser regression requires the local test chain.');
 const wallet=await AgentWalletSession.connect(localWalletProvider(chain),deployment,false);
 if(BigInt((await wallet.balances()).token)<20000000n){await wallet.send({to:deployment.token,data:encodeFunctionData({abi:parseAbi(['function mint(address,uint256)']),functionName:'mint',args:[wallet.account,100000000n]})});console.log('Added local test tokens for browser regression; existing balances/history were preserved.');}
});
test.beforeEach(async({context,page},info)=>{
 const sandbox='browser-'+crypto.randomUUID();info.annotations.push({type:'sandbox',description:sandbox});
 await context.route(base+'/api/**',route=>route.continue({headers:{...route.request().headers(),'x-agentos-sandbox':sandbox}}));
 const errors=[];page.on('pageerror',error=>errors.push(error.message));info.errorsSeen=errors;
});
test.afterEach(async({},info)=>{if(info.errorsSeen)expect(info.errorsSeen).toEqual([]);});
const headers=info=>({'x-agentos-sandbox':info.annotations.find(a=>a.type==='sandbox').description});
const browserDailyCap=async(page,info)=>{const r=await page.request.get('/api/vault',{headers:headers(info)});expect(r.status()).toBe(200);const {view}=await r.json();return formatUnits(BigInt(view.spent)+100n*10n**BigInt(view.decimals),view.decimals);};

test('lost create response retries the same real backend intent and pays once',async({page,context},info)=>{
 const ids=[];let lose=true;
 await context.route(base+'/api/command',async route=>{
  const body=route.request().postDataJSON();if(body?.type!=='create_task'){await route.fallback();return;}
  ids.push(body.requestId);const response=await route.fetch({headers:{...route.request().headers(),...headers(info)}});
  expect(response.status()).toBe(200);
  if(lose){lose=false;await route.abort('failed');}else await route.fulfill({response});
 });
 await page.goto('/#overview');await page.getByRole('button',{name:'新建任务',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'派发新任务'});await modal.locator('input[name=title]').fill('Browser response-loss intent');
 await modal.getByRole('button',{name:'派发任务',exact:true}).click();await expect.poll(()=>ids.length).toBe(1);await expect(modal.getByRole('button',{name:'派发任务',exact:true})).toBeEnabled();
 await page.reload();await page.getByRole('button',{name:'新建任务',exact:true}).click();await expect(modal.locator('input[name=title]')).toHaveValue('Browser response-loss intent');
 await modal.getByRole('button',{name:'派发任务',exact:true}).click();await expect(modal).not.toBeVisible();expect(ids).toHaveLength(2);expect(ids[0]).toBe(ids[1]);
 await expect.poll(async()=>{const r=await page.request.get('/api/workspace',{headers:headers(info)});const {state}=await r.json();return state.tasks[0]?.status;}).toBe('completed');
 const {state}=await(await page.request.get('/api/workspace',{headers:headers(info)})).json();expect(state.tasks).toHaveLength(1);expect(state.ledger.filter(l=>l.kind==='settle')).toHaveLength(1);
});

test('wallet and custom draft survive navigation, reload and Chinese/English switching',async({page})=>{
 await page.goto('/#vault');await page.getByRole('button',{name:'连接本地测试钱包',exact:true}).click();await expect(page.getByRole('button',{name:'断开连接',exact:true})).toBeVisible();
 await page.getByText('创建预注资订单',{exact:true}).click();await page.locator('input[name=title]').fill('Persisted browser draft');await page.locator('select[name=inputMode]').selectOption('custom');
 const records='[{"block":7,"from":"a","to":"b","cents":777}]';await page.locator('textarea[name=records]').fill(records);
 await page.getByRole('button',{name:/^智能体\s*3$/}).click();await page.getByRole('button',{name:'钱包与托管',exact:true}).click();await expect(page.getByRole('button',{name:'断开连接',exact:true})).toBeVisible();await expect(page.locator('input[name=title]')).toHaveValue('Persisted browser draft');
 await page.reload();await expect(page.getByRole('heading',{name:'钱包与托管',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'断开连接',exact:true})).toBeVisible();await page.getByText('创建预注资订单',{exact:true}).click();await expect(page.locator('textarea[name=records]')).toHaveValue(records);await expect(page.locator('input[name=title]')).toHaveValue('Persisted browser draft');
 await page.getByLabel('Switch to English',{exact:true}).click();await expect(page.getByRole('heading',{name:'Wallet & escrow',exact:true})).toBeVisible();await expect(page.locator('textarea[name=records]')).toHaveValue(records);await page.getByLabel('切换为中文',{exact:true}).click();
});

test('order deep link and evidence remain owner scoped after refresh',async({page},info)=>{
 const config=await(await page.request.get(chain+'/config')).json();const rpc=await(await page.request.post(chain+'/rpc',{data:{jsonrpc:'2.0',id:1,method:'eth_accounts',params:[]}})).json();
 const response=await page.request.post('/api/orders',{headers:headers(info),data:{action:'create',requestId:crypto.randomUUID(),title:'Linked evidence order',agentId:'atlas',buyer:rpc.result[0],budget:1000}});expect(response.status()).toBe(200);const {order}=await response.json();expect(order.deployment.escrow).toBe(config.escrow);
 for(let index=0;index<10;index++){const newer=await page.request.post('/api/orders',{headers:headers(info),data:{action:'create',requestId:crypto.randomUUID(),title:'Newer order '+index,agentId:'atlas',buyer:rpc.result[0],budget:1000}});expect(newer.status()).toBe(200);}
 await page.goto('/#vault?order='+order.id);const card=page.locator('[id="order-'+order.id+'"]');await expect(card.getByRole('heading',{name:order.title})).toBeVisible();await card.getByText('统一订单证据',{exact:true}).click();await expect(card.getByRole('cell',{name:'输入承诺',exact:true})).toBeVisible();await expect(card.getByRole('cell',{name:'已核验',exact:true}).first()).toBeVisible();
 await page.reload();await expect(page.locator('[id="order-'+order.id+'"]')).toBeVisible();const cross=await page.request.get('/api/orders/evidence?id='+order.id,{headers:{'x-agentos-sandbox':'other-browser-'+crypto.randomUUID()}});expect(cross.status()).toBe(404);
});

test('degraded model and stale consumer are visible rather than a fixed ready badge',async({page,context})=>{
 await context.route(base+'/api/runtime/health',route=>route.fulfill({json:{checkedAt:new Date().toISOString(),ready:false,services:{database:'healthy',chain:'healthy',model:'unavailable',supplier:'healthy',consumer:'stale'},queue:{pending:2,leased:0,completed:1,dead:1},lastConsumerAt:null,oldestPendingAt:new Date().toISOString()}}));
 await page.goto('/#overview');const panel=page.locator('#runtime-status');await expect(panel).toContainText('部分服务不可用');await expect(panel.locator('.chain-summary > div').filter({hasText:'模型服务'})).toContainText('不可用');await expect(panel.getByRole('button',{name:'重试失败任务'})).toBeEnabled();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('USDC source draft persists after async import, refresh and language switching',async({page,context})=>{
 // UI persistence only; real RPC source and EVM acceptance are exercised by demo:data.
 const input={dataset:'custom-transfers-v1',blockFrom:10,blockTo:10,records:[{block:10,from:'a',to:'b',cents:123}],source:{version:'ui-test-only'}};
 await context.route(base+'/api/data',route=>route.fulfill({json:{input}}));
 await page.goto('/#vault');await page.getByRole('button',{name:'连接本地测试钱包',exact:true}).click();
 await page.getByText('创建预注资订单',{exact:true}).click();await page.locator('select[name=inputMode]').selectOption('onchain');
 await page.locator('input[name=sourceAccount]').fill('0x'+'a'.repeat(40));await page.getByRole('button',{name:'导入 USDC 事件',exact:true}).click();
 await expect(page.locator('textarea[name=chainInput]')).toHaveValue(JSON.stringify(input,null,2));
 await expect.poll(()=>page.evaluate(()=>Object.keys(sessionStorage).some(key=>key.startsWith('agentos.draft.v1:')&&sessionStorage.getItem(key).includes('ui-test-only')))).toBe(true);
 await page.reload();await page.getByText('创建预注资订单',{exact:true}).click();await expect(page.locator('select[name=inputMode]')).toHaveValue('onchain');
 await expect(page.locator('textarea[name=chainInput]')).toHaveValue(JSON.stringify(input,null,2));
 await page.getByLabel('Switch to English',{exact:true}).click();await expect(page.getByRole('button',{name:'Import USDC events',exact:true})).toBeVisible();
 await expect(page.locator('textarea[name=chainInput]')).toHaveValue(JSON.stringify(input,null,2));
});

test('Vault grant purchases without another signature and revocation removes purchase authority',async({page,context},info)=>{
 test.setTimeout(240000);
 let signatures=0;
 await context.route(chain+'/rpc',async route=>{if(route.request().postDataJSON()?.method==='personal_sign')signatures++;await route.continue();});
 await page.goto('/#vault');await page.getByRole('button',{name:'连接本地测试钱包',exact:true}).click();
 await expect(page.getByRole('button',{name:'断开连接',exact:true})).toBeVisible();
 // Use English controls to exercise the new translations and wallet state together.
 await page.getByLabel('Switch to English',{exact:true}).click();
 const panel=page.locator('details').filter({has:page.locator('summary',{hasText:'AgentVault · bounded purchasing'})});
 await panel.locator('summary').click();await panel.locator('input[name=deposit]').fill('10');await panel.locator('input[name=perTask]').fill('3');await panel.locator('input[name=total]').fill('10');await panel.locator('input[name=daily]').fill(await browserDailyCap(page,info));
 await panel.getByRole('button',{name:'Deposit, grant & sign session',exact:true}).click();
 const revoke=panel.getByRole('button',{name:'Revoke Vault purchases',exact:true});await expect(revoke).toBeEnabled({timeout:90000});expect(signatures).toBe(1);
 await page.getByText('Create a pre-funded order',{exact:true}).click();const form=page.locator('details.order-create');
 await form.locator('input[name=title]').fill('Browser Vault purchase');await form.locator('input[name=budget]').fill('3');await form.locator('select[name=fundingMode]').selectOption('vault');
 await expect(form.locator('select[name=vaultSessionId] option')).toHaveCount(1);await expect(form.locator('select[name=vaultSessionId]')).not.toHaveValue('');
 await form.getByRole('button',{name:'Commit order input',exact:true}).click();
 let order;
 await expect.poll(async()=>{const r=await page.request.get('/api/orders',{headers:headers(info)});const d=await r.json();order=d.orders?.find(o=>o.title==='Browser Vault purchase');return order?.status;},{timeout:120000}).toBe('completed');
 expect(order.settlement.status).toBe('paid');expect(order.vaultSessionId).toBeTruthy();expect(order.funding.buyer.toLowerCase()).toBe(order.vault.vault.toLowerCase());expect(signatures).toBe(1);
 await expect(page.locator('[id="order-'+order.id+'"]')).toContainText('Completed');
 // Reconnect after reload from the existing account permission; do not request a new grant.
 await page.reload();await expect(page.getByRole('button',{name:'Disconnect',exact:true})).toBeVisible();await panel.locator('summary').click();await expect(revoke).toBeEnabled();
 await revoke.click();await expect(revoke).toBeDisabled({timeout:60000});expect(signatures).toBe(1);
 await page.getByText('Create a pre-funded order',{exact:true}).click();await form.locator('select[name=fundingMode]').selectOption('vault');
 await expect(form.getByRole('button',{name:'Commit order input',exact:true})).toBeDisabled();await expect(form.locator('select[name=vaultSessionId]')).toHaveValue('');
 const r=await page.request.get('/api/orders',{headers:headers(info)});expect((await r.json()).orders).toHaveLength(1);
 await page.screenshot({path:'outputs/vault-browser-proof.png',fullPage:true});
});

test('workflow retry survives refresh and recovers two paid steps with accepted artifact memory',async({page,context},info)=>{
 test.setTimeout(240000);let signatures=0,lose=true;const ids=[];
 await context.route(chain+'/rpc',async route=>{if(route.request().postDataJSON()?.method==='personal_sign')signatures++;await route.continue();});
 await context.route(base+'/api/workflows',async route=>{
  const body=route.request().postDataJSON();if(body?.action!=='create'){await route.fallback();return;}
  ids.push(body.requestId);const response=await route.fetch({headers:{...route.request().headers(),...headers(info),'x-agentos-queue-only':'1'}});expect(response.status()).toBe(200);
  if(lose){lose=false;await route.abort('failed');}else await route.fulfill({response});
 });
 await page.goto('/#vault');await page.getByRole('button',{name:'连接本地测试钱包',exact:true}).click();await page.getByLabel('Switch to English',{exact:true}).click();
 const vault=page.locator('details').filter({has:page.locator('summary',{hasText:'AgentVault · bounded purchasing'})});await vault.locator('summary').click();await vault.locator('input[name=deposit]').fill('10');await vault.locator('input[name=perTask]').fill('5');await vault.locator('input[name=total]').fill('10');await vault.locator('input[name=daily]').fill(await browserDailyCap(page,info));await vault.getByRole('button',{name:'Deposit, grant & sign session',exact:true}).click();await expect(vault.getByRole('button',{name:'Revoke Vault purchases',exact:true})).toBeEnabled({timeout:90000});expect(signatures).toBe(1);
 const panel=page.locator('#workflow-panel');await panel.locator('summary').click();await panel.locator('input[name=workflowTitle]').fill('Browser accepted memory workflow');
 await expect(panel.locator('select[name=workflowSession] option')).toHaveCount(2);const sessionId=await panel.locator('select[name=workflowSession] option').nth(1).getAttribute('value');await panel.locator('select[name=workflowSession]').selectOption(sessionId);
 await panel.getByRole('button',{name:'Start two-step workflow',exact:true}).click();await expect.poll(()=>ids.length).toBe(1);await expect(panel.getByRole('button',{name:'Start two-step workflow',exact:true})).toBeEnabled();
 await page.reload();await expect(page.getByRole('button',{name:'Disconnect',exact:true})).toBeVisible();await panel.locator('summary').click();await expect(panel.locator('input[name=workflowTitle]')).toHaveValue('Browser accepted memory workflow');await expect(panel.locator('select[name=workflowSession]')).toHaveValue(sessionId);
 await panel.getByRole('button',{name:'Start two-step workflow',exact:true}).click();await expect.poll(()=>ids.length).toBe(2);expect(ids[0]).toBe(ids[1]);
 await expect(panel.getByRole('button',{name:'Recover workflow',exact:true})).toBeVisible();await panel.getByRole('button',{name:'Recover workflow',exact:true}).click();
 await expect(panel).toContainText('Both paid artifacts are preserved.',{timeout:120000});expect(signatures).toBe(1);
 const {state}=await(await page.request.get('/api/workspace',{headers:headers(info)})).json();expect(state.workflows).toHaveLength(1);expect(state.workflows[0].status).toBe('completed');expect(state.chainOrders).toHaveLength(2);const second=state.chainOrders.find(o=>o.input.memory);expect(second.output.transferCount).toBe(2);expect(second.output.totalCents).toBe(679);expect(second.input.memory.orderId).toBe(state.workflows[0].steps[0].orderId);expect(state.chainOrders.every(o=>o.settlement.status==='paid')).toBe(true);
 for(const order of state.chainOrders)await expect(page.locator('[id="order-'+order.id+'"]')).toContainText('Completed');
 await page.getByLabel('切换为中文',{exact:true}).click();await expect(panel).toContainText('两份已付款成果均已保存');await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'outputs/workflow-browser-proof.png',fullPage:true});
});
