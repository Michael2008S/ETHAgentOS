import {test,expect} from '@playwright/test';

test('credential expiry advances without refetching or another user action',async({page})=>{
 const now=Date.now();let reads=0;
 await page.addInitScript(()=>localStorage.setItem('agentos.language','en'));
 await page.clock.install({time:now});
 await page.route('**/api/runtime/consumers',route=>{reads++;return route.fulfill({json:{credentials:[{id:'expiry-fixture',name:'Expiry clock fixture',expiresAt:new Date(now+60000).toISOString()}]}});});
 await page.goto('/#overview');const panel=page.locator('#runtime-status');
 await panel.getByText('Recovery consumer access',{exact:true}).click();
 const credential=panel.getByText('Expiry clock fixture',{exact:true}).locator('..');
 await expect(credential).toContainText('Active');const initialReads=reads;
 await page.clock.fastForward(61000);
 await expect(credential).toContainText('Expired');expect(reads).toBe(initialReads);
});

test('language restores across reload, syncs across tabs and switches when storage writes fail',async({page,context})=>{
 await page.addInitScript(()=>localStorage.setItem('agentos.language','en'));
 await page.goto('/#overview');await expect(page.getByRole('heading',{name:'Mission control',exact:true})).toBeVisible();
 const other=await context.newPage();await other.goto('/#overview');await expect(other.getByRole('heading',{name:'Mission control',exact:true})).toBeVisible();
 await page.getByLabel('切换为中文',{exact:true}).click();await expect(other.getByRole('heading',{name:'任务总览',exact:true})).toBeVisible();
 await other.reload();await expect(other.getByRole('heading',{name:'任务总览',exact:true})).toBeVisible();
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='agentos.language')throw new DOMException('Storage quota','QuotaExceededError');return original.call(this,key,value);};});
 await page.getByLabel('Switch to English',{exact:true}).click();await expect(page.getByRole('heading',{name:'Mission control',exact:true})).toBeVisible();
 await other.close();
});
