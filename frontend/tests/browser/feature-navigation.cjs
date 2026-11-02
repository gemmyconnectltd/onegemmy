/* Isolated navigation regression: no production data or writes. */
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:3104';
const user={id:'11111111-1111-4111-8111-111111111111',tenant_id:'22222222-2222-4222-8222-222222222222',full_name:'Branch Manager',email:'manager@example.test',tenant_name:'Test business',role:'branch manager',is_superuser:false,is_active:true,permissions:['orders:read','pos:read','items:read','expenses:read','accounts_payable:read'],disabled_modules:['inventory','accounting'],branch_ids:null,branch_id:null,role_id:null,exp:Math.floor(Date.now()/1000)+3600};
const features=Object.fromEntries(['sales','inventory','procurement','accounting','services','manufacturing','hr','crm','repairs'].map(k=>[k,k!=='manufacturing']));
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext();
 await context.addInitScript(user=>{localStorage.setItem('onegemmy_token','test.'+btoa(JSON.stringify(user))+'.test');localStorage.setItem('onegemmy_tour_seen','1');},user);
 let inventoryRequests=0;
 await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.fallback():route.abort());
 await context.route('**/api/v1/**',route=>{
  const path=new URL(route.request().url()).pathname.replace('/api/v1','');let data;
  if(path==='/tenants/users/me')data=user;
  else if(path==='/tenants/me/entitlements')data={features,modules:Object.fromEntries(Object.entries(features).map(([k,v])=>[k,v?'enabled':'restricted'])),limits:{}};
  else if(path==='/global/currencies')data=[{code:'RWF',name:'Rwandan franc',symbol:'RWF',decimal_places:0}];
  else if(path===`/tenants/${user.tenant_id}`||path==='/tenants/me')data={id:user.tenant_id,name:user.tenant_name,currency:'RWF',brand_color:'#16A34A',is_active:true};
  else if(path==='/tenants/branches')data={items:[],total:0,page:1,page_size:20};
  else if(path==='/tenants/sales/orders'||path==='/tenants/sales/customers')data={items:[],total:0,page:1,page_size:20};
  else {if(path==='/tenants/inventory/products' && new URL(route.request().url()).searchParams.get('page_size')==='20')inventoryRequests++;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'No fixture data'})});}
  return route.fulfill({contentType:'application/json',body:JSON.stringify({data,message:'Fixture'})});
 });
 const page=await context.newPage();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/sales/orders');await page.getByRole('button',{name:'Search pages',exact:true}).waitFor();
  if(width>=1024){const nav=page.getByRole('navigation',{name:'Main navigation'});await nav.getByRole('link',{name:'Sales',exact:true}).waitFor();for(const name of ['Inventory','Accounting','Expenses','Debt Management','Team & Access','Reports','Overview','Manufacturing'])assert.equal(await nav.getByRole('link',{name,exact:true}).count(),0,name);}
  else{const quick=page.getByRole('navigation',{name:'Quick navigation'});assert.equal(await quick.getByRole('link',{name:'Inventory',exact:true}).count(),0);await quick.getByRole('button',{name:'Open navigation'}).click();const nav=page.getByRole('navigation',{name:'Mobile navigation'});assert.equal(await nav.getByRole('link',{name:'Team & Access',exact:true}).count(),0);assert.equal(await nav.getByRole('link',{name:'Expenses',exact:true}).count(),0);await page.keyboard.press('Escape');}
  await page.getByRole('button',{name:'Search pages',exact:true}).click();await page.getByRole('textbox',{name:'Search pages',exact:true}).fill('Inventory');assert.equal(await page.getByRole('navigation',{name:'Search results'}).getByRole('link').count(),0);await page.keyboard.press('Escape');
  for(const path of ['/settings/users','/inventory/products','/expenses/list']){await page.goto(base+path);await page.waitForURL(url=>url.pathname==='/sales/orders');assert.equal(await page.getByText(/You don't have access|isn't available/).count(),0);}
 }
 assert.equal(inventoryRequests,0,'disabled inventory page never mounts');
 user.disabled_modules.push('sales');
 await page.goto(base+'/sales/orders');await page.waitForURL(url=>!url.pathname.startsWith('/sales'));
 await page.getByRole('navigation',{name:'Quick navigation'}).getByRole('button',{name:'Open navigation'}).click();assert.equal(await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Customers',exact:true}).count(),0);await page.keyboard.press('Escape');
 features.sales=false;
 await page.goto(base+'/pos');await page.waitForURL(url=>url.pathname!=='/pos');assert.equal(await page.getByRole('link',{name:'Open point of sale'}).count(),0);
 await browser.close();console.log('Passed: desktop/mobile menu filtering, search, disabled-URL redirects, inherited finance switches, POS hiding, and no disabled inventory page requests.');
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
