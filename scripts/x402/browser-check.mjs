import {resolve} from 'node:path';
export async function checkX402Browser({base,headers,directory,orderId}){
 process.env.PLAYWRIGHT_BROWSERS_PATH??=resolve('.sites-runtime/playwright-browsers');
 const {chromium,expect}=await import('@playwright/test'),browser=await chromium.launch({headless:true,channel:'chromium'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route(base+'/api/**',route=>route.continue({headers:{...route.request().headers(),...headers}}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/#vault?order='+orderId);
  await page.getByLabel('Switch to English',{exact:true}).click();await page.getByRole('button',{name:'Connect local test wallet',exact:true}).click();await expect(page.getByRole('button',{name:'Disconnect',exact:true})).toBeVisible();
  const card=page.locator('[id="order-'+orderId+'"]');await card.getByText('Unified order evidence',{exact:true}).click();const evidence=card.getByRole('region',{name:'x402 procurement evidence'});await expect(evidence).toContainText('0.20 DemoUSDC');await expect(evidence).toContainText('full user escrow to Vault');
  await page.getByText('Create a pre-funded order',{exact:true}).click();const form=page.locator('.order-create form');await form.locator('select[name=executor]').selectOption('supplier');await form.locator('select[name=supplierId]').selectOption('local-x402-treasury');await form.locator('select[name=agentId]').selectOption('sage');await form.locator('select[name=fundingMode]').selectOption('vault');await form.locator('select[name=inputMode]').selectOption('custom');
  const review=page.getByRole('region',{name:'x402 policy review'}),checkbox=review.getByRole('checkbox');await expect(checkbox).not.toBeChecked();await expect(review).toContainText('0.20 DemoUSDC');await checkbox.check();await expect(checkbox).toBeChecked();await form.locator('textarea[name=records]').fill('[{"block":1,"from":"treasury","to":"alice","cents":123}]');await expect(checkbox).not.toBeChecked();
  await review.scrollIntoViewIfNeeded();await review.screenshot({path:directory+'/browser-policy-en.png'});await page.getByLabel('切换为中文',{exact:true}).click();await expect(review).toContainText('上游费用由供应商承担');await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await review.screenshot({path:directory+'/browser-policy-zh-mobile.png'});
  await expect(errors).toEqual([]);return {passed:true,checks:['paid procurement evidence visible','reviewed policy and supplier liability visible','disclosure resets when input changes','Chinese and English','mobile has no horizontal overflow','no browser errors']};
 }finally{await browser.close();}
}
