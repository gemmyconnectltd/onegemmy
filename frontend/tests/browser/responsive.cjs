/* Run with PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser/responsive.cjs.
   The browser and API fixtures are isolated from real customer data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:3103';
const OUT = process.env.RESPONSIVE_OUTPUT || '/private/tmp/pesaa-responsive-results';
const widths = process.env.RESPONSIVE_WIDTHS ? process.env.RESPONSIVE_WIDTHS.split(",").map(Number) : [320,360,375,390,430,768,820,1024,1280,1440,1920];
const id = '11111111-1111-4111-8111-111111111111', tenantId = '22222222-2222-4222-8222-222222222222';
const branchA = '33333333-3333-4333-8333-333333333333', branchB = '44444444-4444-4444-8444-444444444444';
const user = {id,sub:id,tenant_id:tenantId,tenant_name:'Long Business Name for Responsive Workspace Testing',tenant_slug:'responsive-test',full_name:'Test Owner',email:'owner@example.test',role:'owner',is_superuser:true,is_active:true,permissions:[],disabled_modules:[],branch_id:null,branch_ids:null,branch_name:null,role_id:null,exp:Math.floor(Date.now()/1000)+3600};
const product = {id:'55555555-5555-4555-8555-555555555555',name:'Long Product Name · Premium Whole Grain Flour',sku:'PRD-RESPONSIVE-VERY-LONG-SKU-1234567890',price:52000,cost:20000,stock:50,min_stock:5,is_active:true,has_variants:false,variants:[],image_url:null,category:{id:'c',name:'Groceries'},brand:null,unit:null};
const customer={id:'66666666-6666-4666-8666-666666666666',name:'Long Customer Name for Responsive Checks',email:'customer@example.test',phone:'000000000',customer_type:'business',is_active:true,credit_limit:null};
const order={id:'77777777-7777-4777-8777-777777777777',order_number:'ORD-RESPONSIVE-001',status:'Completed',items:[],total:52000,subtotal:52000,tax:0,discount:0,customer,customer_id:customer.id,payment_status:'Paid',outstanding_balance:0,amount_paid:52000,ordered_at:'2026-11-02T10:00:00Z',notes:'POS — Cash',due_date:null};
const features = Object.fromEntries(['sales','inventory','procurement','services','hr','accounting','crm','manufacturing','repairs'].map(k=>[k,true]));
let errors=[]; let requests=[]; let browser;
async function fixture(route) {
 const url=new URL(route.request().url()), p=url.pathname.replace('/api/v1','');requests.push({path:p,branch:route.request().headers()['x-branch-id']||null});
 const list=(items=[])=>({items,total:items.length,page:1,page_size:20}); let data;
 if(p==='/tenants/users/me') data=user;
 else if(p==='/tenants/me/entitlements') data={features,modules:Object.fromEntries(Object.keys(features).map(k=>[k,'enabled'])),limits:{}};
 else if(p==='/tenants/me' || p===`/tenants/${tenantId}`) data={id:tenantId,name:user.tenant_name,slug:'responsive-test',currency:'RWF',is_active:true,brand_color:'#16A34A',vat_enabled:true,multi_branch:true,approval_rules:{},features:{},module_activation:{}};
 else if(p==='/global/currencies') data=[{code:'RWF',symbol:'RWF',name:'Rwandan franc',decimal_places:0}];
 else if(p==='/tenants/branches') data=list([{id:branchA,name:'Main authorized branch',is_main:true},{id:branchB,name:'Second authorized branch',is_main:false}]);
 else if(p===`/tenants/branches/${branchA}`) data={id:branchA,name:'Main authorized branch'};
 else if(p===`/tenants/branches/${branchB}`) data={id:branchB,name:'Second authorized branch'};
 else if(/^\/tenants\/users\/[^/]+\/access$/.test(p)) data={user:{...user,is_owner:true},branches:{all:true,branches:[]},groups:[],modules:[]};
 else if(p==='/tenants/roles/review') data=[];
 else if(p==='/tenants/debts/overview') data={currency:'RWF',items:[],totals:{receivable:{outstanding:'0',overdue:'0',aging:{'0-30':'0','31-60':'0','61-90':'0','90+':'0'}},payable:{outstanding:'0',overdue:'0',aging:{'0-30':'0','31-60':'0','61-90':'0','90+':'0'}}}};
 else if(p.startsWith('/tenants/debts/') && p.endsWith('/search')) data={...list(),currency:'RWF',summary:{outstanding:'0',overdue:'0',aging:{'0-30':'0','31-60':'0','61-90':'0','90+':'0'}}};
 else if(p.includes('/billing/overview') || /^\/tenants\/procurement\/supplier-bills\/[^/]+$/.test(p) || /^\/support\/my\/tickets\/[^/]+$/.test(p)) return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({message:'No fixture record'})});
 else if(p.endsWith('/attachments')) data=[];
 else if(['/tenants/services/staff-commissions','/tenants/services/catalog/all','/tenants/services/queue'].includes(p)) data=[];
 else if(/^\/tenants\/roles\/[^/]+\/access$/.test(p)) data={role:{id,name:'Test role',description:null,built_in:false,users:0,permissions:0},groups:[],modules:[]};
 else if(/^\/tenants\/procurement\/purchase-orders\/[^/]+$/.test(p)) data={id,tenant_id:tenantId,reference:'PO-TEST-001',status:'Draft',subtotal:0,discount:0,tax:0,total:0,items:[],supplier:null,supplier_id:null,created_at:'2026-11-02T10:00:00Z',notes:null};
 else if(p==='/tenants/inventory/products') data=list([product]);
 else if(/^\/tenants\/sales\/customers\/[^/]+\/profile$/.test(p)) data={name:customer.name,customer:{...customer,created_at:'2026-11-02T10:00:00Z'},currency:'RWF',summary:{lifetime_sales:0,completed_orders:0},sections:{orders:list()},deals:0};
 else if(p==='/tenants/sales/customers') data=list([customer]);
 else if(p==='/tenants/sales/orders') data=list([order]);
 else if(p.endsWith('/income-statement')) data={revenue:[],expenses:[],total_revenue:0,total_expenses:0,net_income:0,gross_profit:0};
 else if(p.endsWith('/cash-flow')) data={operating:[],investing:[],financing:[],operating_total:0,investing_total:0,financing_total:0,net_change:0};
 else if(p.endsWith('/approvals/summary')) data={pending:0};
 else if(p.endsWith('/accounting/accounts')) data=list();
 else if(p==='/tenants/me/modules') data={plan:null,modules:[]};
 else if(p.includes('/reports/')) return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Report fixture unavailable'})});
 else data={...list(),summary:{total:0,total_users:0,active_users:0,roles:0,without_role:0,with_role:0,modules_on:0,modules_total:0,total_amount:0,overdue_amount:0},categories:[],items:[],entries:[],totals:{}};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data,message:'Test fixture'})});
}
async function ready(page, url) {await page.goto(BASE+url, {waitUntil:"domcontentloaded"});await page.locator('header').first().waitFor({timeout:20000});await page.waitForLoadState('networkidle',{timeout:15000});await page.waitForTimeout(150);}
async function overflow(page) {return page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+2||r.left<-2)&&getComputedStyle(e).position!=='fixed'&&!e.closest('[data-table-container], .overflow-x-auto, .overflow-x-scroll, [aria-label="Application sidebar"]')}).slice(0,8).map(e=>({tag:e.tagName,classes:e.className,text:e.textContent?.slice(0,60)}))}));}
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(({user})=>{localStorage.setItem('onegemmy_token','test.'+btoa(JSON.stringify(user))+'.test');localStorage.setItem('onegemmy_tour_seen','1');localStorage.setItem('app_theme','light');},{user});
 await context.route("**/*", route => { const host = new URL(route.request().url()).hostname; return ["127.0.0.1","localhost"].includes(host) ? route.fallback() : route.abort(); });
 await context.route('**/api/v1/**',fixture);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const results=[];
 const routes=process.env.RESPONSIVE_ALL_ROUTES ? JSON.parse(fs.readFileSync(path.join(__dirname,"../../..","docs/responsive/route-audit.json"),"utf8")).routes.map(r=>r.route.replace(/\[[^\]]+\]/g,id)) : process.env.RESPONSIVE_ROUTES?.split(',')||['/inventory/products','/customers','/sales/orders','/procurement/orders','/hr','/settings','/accounting/accounts','/pos'];
 async function inspect(target, width, route, failures) {
   failures.length=0;
   try {await ready(target,route); const result=await overflow(target);results.push({requestedWidth:width,route,...result,errors:[...failures]});}
   catch(e){results.push({requestedWidth:width,viewport:width,width,route,errors:[...failures,e.message]});}
   const result=results.at(-1);if(result.width>width+2||result.errors.length) console.log(JSON.stringify(result));
   fs.writeFileSync(path.join(OUT,"results.json"),JSON.stringify(results,null,2));
 }
 for(const width of widths){
   if(process.env.RESPONSIVE_ALL_ROUTES){
     let next=0;
     await Promise.all(Array.from({length:4},async()=>{const worker=await context.newPage();const failures=[];worker.on("pageerror",e=>failures.push(e.message));worker.on("console",m=>{if(m.type()==="error" && /TypeError|Cannot read|is not a function/.test(m.text()))failures.push(m.text());});await worker.setViewportSize({width,height:width<768?844:900});while(next<routes.length){const route=routes[next++];await inspect(worker,width,route,failures);}await worker.close();}));
   } else {await page.setViewportSize({width,height:width<768?844:900});for(const route of routes)await inspect(page,width,route,errors);}
 }

 if(process.env.RESPONSIVE_SMOKE_ONLY) {await browser.close();console.log(JSON.stringify({checks:results.length,failures:results.filter(r=>r.width>r.viewport+2||r.errors.length).length,output:OUT}));if(results.some(r=>r.width>r.viewport+2||r.errors.length)) process.exitCode=1;return;}
 await page.setViewportSize({width:390,height:844});await ready(page,'/inventory/products');
 await page.screenshot({path:path.join(OUT,'products-390.png'),fullPage:true});
 await page.getByRole('button',{name:'Switch business and branch'}).click();await page.getByRole('dialog',{name:'Business & branch'}).waitFor();
 await page.getByRole('radio',{name:'Second authorized branch'}).check();await page.getByRole('button',{name:'Switch to selected workspace'}).click();
 await page.waitForFunction(()=>localStorage.getItem('onegemmy_active_branch_id')==='44444444-4444-4444-8444-444444444444');
 await page.waitForTimeout(300);assert(requests.some(r=>r.path==='/tenants/inventory/products'&&r.branch===branchB),'branch-scoped data was refetched');
 await page.getByRole('button',{name:'Edit',exact:true}).first().isVisible().catch(()=>false);
 await page.getByText('Product actions',{exact:true}).first().click();await page.getByRole('button',{name:'Edit',exact:true}).first().click();
 const dialog=page.getByRole('dialog').first();await dialog.waitFor();
 const form=dialog.locator('form').first();if(await form.count()){await page.screenshot({path:path.join(OUT,"before-edit-390.png"),fullPage:true});const input=dialog.getByRole("textbox",{name:/Product name/});await input.fill('Unsaved edited product');let asked=false;page.once('dialog',async d=>{asked=true;await d.dismiss();});await dialog.getByRole('button',{name:'Close',exact:true}).click();assert(asked,'unsaved form dismissal asks for confirmation');assert(await dialog.isVisible(),'cancel keeps editing');await page.screenshot({path:path.join(OUT,'edit-390.png'),fullPage:false});page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'Close',exact:true}).click();}
 // Focus containment/restoration and functional page search.
 await page.getByRole('button',{name:'Search pages',exact:true}).click();await page.getByRole('dialog',{name:'Search pages'}).waitFor();await page.getByRole('textbox',{name:'Search pages',exact:true}).fill('Products');assert(await page.getByRole('navigation',{name:'Search results'}).getByRole('link').count()>0);await page.keyboard.press('Escape');assert(await page.getByRole('button',{name:'Search pages',exact:true}).evaluate(e=>e===document.activeElement));

 await ready(page,'/settings');
 const businessName=page.getByRole('textbox',{name:/Business name/});const originalBusinessName=await businessName.inputValue();await businessName.fill('Unsaved business edit');
 await page.getByRole('button',{name:'Switch business and branch'}).click();
 await page.getByRole('radio',{name:'Main authorized branch'}).check();let workspaceAsked=false;page.once('dialog',async d=>{workspaceAsked=true;await d.dismiss();});
 await page.getByRole('button',{name:'Switch to selected workspace'}).click();assert(workspaceAsked,'switch confirms unsaved edits');assert.equal(await page.evaluate(()=>localStorage.getItem('onegemmy_active_branch_id')),branchB);
 await page.getByRole('dialog',{name:'Business & branch'}).getByRole('button',{name:'Close',exact:true}).click();assert.equal(await businessName.inputValue(),'Unsaved business edit');
 let navigationAsked=false;page.once('dialog',async d=>{navigationAsked=true;await d.dismiss();});await page.getByRole('navigation',{name:'Quick navigation'}).getByRole('link',{name:'Sales',exact:true}).click();assert(navigationAsked);assert(new URL(page.url()).pathname==='/settings');
 await businessName.fill(originalBusinessName);await page.getByRole('navigation',{name:'Quick navigation'}).getByRole('link',{name:'Inventory',exact:true}).click();await page.getByRole('heading',{name:'Products',exact:true}).waitFor();
 await page.getByRole('button',{name:'Open account menu'}).click();await page.getByRole('button',{name:'Dark theme',exact:true}).click();await page.screenshot({path:path.join(OUT,'products-dark-390.png'),fullPage:false});await page.keyboard.press('Escape');
 await page.setViewportSize({width:820,height:430});await ready(page,'/inventory/products');assert((await overflow(page)).width<=822,'landscape tablet fits');
 await page.setViewportSize({width:390,height:400});await page.getByText('Product actions',{exact:true}).first().click();await page.getByRole('button',{name:'Edit',exact:true}).first().click();const shortDialog=page.getByRole('dialog',{name:'Edit Product'});await shortDialog.waitFor();const box=await shortDialog.boundingBox();assert(box.height<=401,'dialog fits reduced visual viewport');assert(await shortDialog.getByRole('button',{name:'Save Changes',exact:true}).isVisible());await shortDialog.getByRole('button',{name:'Close',exact:true}).click();
 const restricted={...user,role:'member',is_superuser:false,branch_id:branchA,branch_ids:[branchA],branch_name:'Main authorized branch',permissions:['orders:read','orders:update','pos:read'],disabled_modules:['inventory']};
 const limited=await browser.newContext({viewport:{width:390,height:844}});
 await limited.addInitScript(({user})=>{localStorage.setItem('onegemmy_token','test.'+btoa(JSON.stringify(user))+'.test');localStorage.setItem('onegemmy_tour_seen','1');},{user:restricted});
 await limited.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.fallback():route.abort());await limited.route('**/api/v1/**',fixture);
 await limited.route('**/api/v1/tenants/users/me',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({data:restricted})}));
 await limited.route('**/api/v1/tenants/branches?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({data:{items:[{id:branchA,name:'Main authorized branch'}],total:1,page:1,page_size:20}})}));
 const limitedPage=await limited.newPage();await ready(limitedPage,'/sales/orders');const quick=limitedPage.getByRole('navigation',{name:'Quick navigation'});assert.equal(await quick.getByRole('link',{name:'Inventory',exact:true}).count(),0);assert.equal(await quick.getByRole('link',{name:'Home',exact:true}).count(),0);
 await quick.getByRole('button',{name:'Open navigation'}).click();const more=limitedPage.getByRole('navigation',{name:'Mobile navigation'});assert.equal(await more.getByRole('link',{name:'Inventory',exact:true}).count(),0);assert.equal(await more.getByRole('link',{name:'Reports',exact:true}).count(),0);await limitedPage.keyboard.press('Escape');
 await limitedPage.getByRole('button',{name:'Switch business and branch'}).click();assert.equal(await limitedPage.getByRole('radio',{name:'Second authorized branch'}).count(),0);assert(await limitedPage.getByRole('button',{name:'Switch to selected workspace'}).isDisabled());await limited.close();

 fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));await browser.close();
 console.log(JSON.stringify({checks:results.length,failures:results.filter(r=>r.width>r.viewport+2||r.errors.length).length,output:OUT}));
 if(results.some(r=>r.width>r.viewport+2||r.errors.length))process.exitCode=1;
})().catch(async e=>{console.error(e);if(browser) await browser.close();process.exitCode=1;});
