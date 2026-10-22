import {test,expect} from '@playwright/test';

test('business polling keeps one subscription across language rerenders and refreshes when filters change',async({page,context})=>{
 const sandbox='effect-poll-'+crypto.randomUUID(),headers={'x-agentos-sandbox':sandbox};
 const state=await(await page.request.get('/api/workspace',{headers})).json(),scope=state.scope;
 await context.route('**/api/**',route=>route.continue({headers:{...route.request().headers(),...headers}}));
 const calls={alerts:0,capacity:0,missions:0};
 for(const [path,key,payload]of[['business-alerts','alerts',{alerts:[]}],['business-capacity','capacity',{capacity:[]}],['business-missions','missions',{missions:[]}]]){
  await page.route('**/api/'+path+'*',route=>{calls[key]++;return route.fulfill({json:{scope,...payload}});});
 }
 await page.clock.install();await page.goto('/#business');
 await expect(page.locator('#business-missions')).toBeVisible();
 await expect.poll(()=>({...calls})).toEqual({alerts:1,capacity:1,missions:1});
 await page.getByLabel('Switch to English',{exact:true}).click();
 await page.getByLabel('切换为中文',{exact:true}).click();
 expect(calls).toEqual({alerts:1,capacity:1,missions:1});
 await page.clock.fastForward(5100);
 await expect.poll(()=>({...calls})).toEqual({alerts:2,capacity:1,missions:2});
 await page.getByLabel('Switch to English',{exact:true}).click();
 await page.getByLabel('Include archived history',{exact:true}).check();
 await expect.poll(()=>calls.missions).toBe(3);
 expect(calls.alerts).toBe(2);expect(calls.capacity).toBe(1);
 const before={...calls};await page.goto('/#agents');await page.clock.fastForward(6000);
 expect(calls).toEqual(before);
});
