/* Synthetic API fixtures only; no production records, emails or stock writes. */
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:3107';
const id = '33333333-3333-4333-8333-333333333333';
const user = {id:'11111111-1111-4111-8111-111111111111',tenant_id:'22222222-2222-4222-8222-222222222222',full_name:'Test Owner',email:'owner@example.test',tenant_name:'Fixture business',role:'owner',is_superuser:true,is_active:true,permissions:['items:read','items:update','stock:create'],disabled_modules:[],branch_ids:null,branch_id:null,exp:Math.floor(Date.now()/1000)+3600};
const product = {id,name:'Tracked product',sku:'SKU-001',description:'A recorded product',price:120,cost:60,stock:12,min_stock:5,is_active:true,has_variants:false,sale_by_weight:false,variants:[],image_url:null,category:null,brand:null,unit:{id:'unit',name:'Piece',abbreviation:'pc'},supplier:null,category_id:null,brand_id:null,unit_id:'unit',supplier_id:null,created_at:'2026-01-01T10:00:00Z',updated_at:'2026-11-02T10:00:00Z'};
const events = Array.from({length:23},(_,i)=>({id:`e-${i}`,type:i===0?'product_event':'sale',category:i===0?'prices':'movements',occurred_at:'2026-11-02T10:00:00Z',reference:i===0?null:`ORD-${i}`,source_id:i===0?id:`order-${i}`,source:i===0?'product':'sale',branch_id:'branch-a',other_branch_id:null,actor_id:user.id,branch:'Branch A',other_branch:null,actor:'Test Owner',quantity:i===0?null:1,quantity_change:i===0?null:-1,status:i===0?null:'Completed',details:i===0?{summary:'Price updated: Tracked product',changes:{before:{price:100},after:{price:120}}}:{unit_price:120,total:120,currency:'RWF',customer:'Test customer'}}));
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
 const ctx=await browser.newContext();
 await ctx.addInitScript(user=>{localStorage.setItem('onegemmy_token','test.'+btoa(JSON.stringify(user))+'.test');localStorage.setItem('onegemmy_tour_seen','1');},user);
 const requests=[]; const errors=[]; const writes=[];
 await ctx.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.fallback():r.abort());
 await ctx.route('**/api/v1/**',r=>{
  const u=new URL(r.request().url()), path=u.pathname.replace('/api/v1',''); let data;
  if(path.endsWith(`products/${id}/details`)) data={product,current_stock:12,total_sold:22,modules:['sales','procurement'],stock_scope:'business',limitations:['Stock is business-wide.','Legacy balances are not recorded.']};
  else if(path.endsWith(`products/${id}/history`)){
   requests.push(Object.fromEntries(u.searchParams));
   if(u.searchParams.get('export_csv')) return r.fulfill({contentType:'text/csv',headers:{'Content-Disposition':'attachment; filename="product-history.csv"'},body:'Timestamp,Product,Activity\n2026-11-02,Tracked product,Price updated\n'});
   const category=u.searchParams.get('category')||'all', search=u.searchParams.get('search'),kind=u.searchParams.get('kind');
   let rows=events.filter(e=>(category==='all'||e.category===category)&&(!search||e.reference?.includes(search))&&(!kind||e.type===kind));
   const page=Number(u.searchParams.get('page')||1);data={items:rows.slice((page-1)*20,page*20),total:rows.length,page,page_size:20,counts:{prices:1,movements:22}};
  }
  else if(path==='/tenants/users/me')data=user;
  else if(path==='/tenants/me/entitlements'){const features=Object.fromEntries(['sales','inventory','procurement','accounting','services','manufacturing','hr','crm'].map(k=>[k,true]));data={features,modules:Object.fromEntries(Object.keys(features).map(k=>[k,'enabled'])),limits:{}};}
  else if(path==='/tenants/me'||path===`/tenants/${user.tenant_id}`)data={id:user.tenant_id,name:'Fixture business',currency:'RWF',is_active:true};
  else if(path==='/global/currencies')data=[{code:'RWF',name:'Rwandan franc',symbol:'RWF',decimal_places:0}];
  else if(path==='/tenants/branches')data={items:[{id:'branch-a',name:'Branch A'}],total:1,page:1,page_size:20};
  else if(path===`/tenants/inventory/products/${id}`){
   if(r.request().method()==='PATCH'){const body=r.request().postDataJSON();assert.deepEqual(Object.keys(body),['is_active']);writes.push(body);product.is_active=body.is_active;}
   data=product;
  }
  else if(path==='/tenants/inventory/transfers/destinations')data=[{id:'branch-a',name:'Branch A'}];
  else if(path==='/tenants/inventory/transfers')data={items:[],total:0,page:1,page_size:100};
  else if(path==='/tenants/inventory/products')data={items:[product],total:1,page:1,page_size:20};
  else if(/inventory\/(categories|brands|units)$/.test(path))data=[];
  else return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'No synthetic fixture'})});
  return r.fulfill({contentType:'application/json',body:JSON.stringify({data,message:'Fixture'})});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1440,height:950});
 await page.goto(base+'/inventory/products');
 const actionButton=()=>page.getByRole('button',{name:'Actions for Tracked product'}).filter({visible:true}).first();
 await actionButton().click();
 const menu=page.getByRole('menu');
 for(const name of ['View Details','Edit Product','Stock History','Transfer Stock','Adjust Stock','Deactivate']) await menu.getByRole('menuitem',{name,exact:true}).waitFor();
 await page.screenshot({path:'/private/tmp/product-actions-menu.png'});
 await page.keyboard.press('Escape');
 await page.getByRole('menu').waitFor({state:'hidden'});
 await actionButton().click();await page.getByRole('menuitem',{name:'Adjust Stock',exact:true}).click();
 await page.getByRole('dialog',{name:'Adjust Stock'}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).overflowY),'hidden','closing menu-opened stock drawer must release page scrolling');
 await actionButton().click();await page.getByRole('menuitem',{name:'Edit Product',exact:true}).click();
 await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).overflowY),'hidden','closing menu-opened edit drawer must release page scrolling');
 await actionButton().click();await page.getByRole('menuitem',{name:'Deactivate',exact:true}).click();
 await page.getByRole('dialog',{name:'Deactivate product'}).waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await actionButton().click();await page.getByRole('menuitem',{name:'Deactivate',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Deactivate',exact:true}).click();await page.locator('tbody').getByText('Inactive',{exact:true}).waitFor();
 await actionButton().click();await page.getByRole('menuitem',{name:'Activate',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Activate',exact:true}).click();await page.locator('tbody').getByText('Active',{exact:true}).waitFor();
 assert.deepEqual(writes,[{is_active:false},{is_active:true}]);

 await actionButton().click();await page.getByRole('menuitem',{name:'Stock History',exact:true}).click();
 await page.getByRole('tab',{name:'History',exact:true,selected:true}).waitFor();
 await page.goto(base+'/inventory/products');await actionButton().click();await page.getByRole('menuitem',{name:'Transfer Stock',exact:true}).click();
 await page.getByRole('option',{name:/Tracked product/}).waitFor({state:'attached'});
 assert.equal(await page.locator('select').filter({has:page.getByRole('option',{name:/Tracked product/})}).inputValue(),id);

 for(const width of [1440,768,390]){
  await page.setViewportSize({width,height:950});await page.goto(`${base}/inventory/products/${id}`);
  await page.getByRole('heading',{name:'Tracked product',exact:true}).waitFor();
  assert.equal(await page.getByText('50.0%',{exact:true}).count(),1);
  await page.getByRole('tab',{name:'History',exact:true}).click();
  await page.getByRole('button',{name:/Price updated: Tracked product/}).waitFor();
  await page.mouse.move(width-100,700);await page.mouse.wheel(0,600);
  await page.waitForFunction(()=>window.scrollY>0);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:`/private/tmp/product-history-${width}.png`,fullPage:true});
  if(width>=1024) await page.getByRole('button',{name:/Price changes/}).click();
  else await page.getByLabel('Activity category').selectOption('prices');
  await page.waitForFunction(()=>document.body.innerText.includes('1 activities')||document.body.innerText.includes('1 activity'));
  await page.getByRole('button',{name:/Price updated: Tracked product/}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('columnheader',{name:'Before'}).waitFor();
  await page.keyboard.press('Escape');
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Export history'}).click();assert.match((await downloaded).suggestedFilename(),/^product-history.*\.csv$/);
  if(width>=1024)await page.getByRole('button',{name:/All activities/}).click();else await page.getByLabel('Activity category').selectOption('all');
  await page.getByLabel('Transaction reference').fill('ORD-21');
  await page.getByRole('button',{name:/Sale.*ORD-21/}).waitFor();
  assert(requests.some(r=>r.search==='ORD-21'));
  await page.getByRole('tab',{name:'Sales',exact:true}).click();await page.getByRole('columnheader',{name:'Branch',exact:true}).waitFor();
  for(const tab of ['Purchases','Transfers','Adjustments']){
   await page.getByRole('tab',{name:tab,exact:true}).click();await page.getByRole('heading',{name:'No activity found'}).waitFor();
  }
  await page.getByRole('tab',{name:'Stock',exact:true}).click();await page.getByRole('heading',{name:'Stock availability'}).waitFor();
  await page.getByRole('tab',{name:'Overview',exact:true}).click();
  await page.getByRole('button',{name:'Edit product',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
  assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=width+1,`page overflow at ${width}`);
 }
 assert(!errors.some(e=>/hydrat|Minified React error/.test(e)),errors.join('\n'));
 await page.goto(`${base}/inventory/products?q=Tracked&size=20`);await page.getByRole('link',{name:'Tracked product',exact:true}).filter({visible:true}).first().click();
 await page.getByRole('heading',{name:'Tracked product',exact:true}).waitFor();await page.getByRole('button',{name:'Back',exact:true}).click();await page.waitForURL(u=>u.pathname==='/inventory/products');assert(new URL(page.url()).searchParams.get('q')==='Tracked');
 assert(requests.some(r=>r.export_csv==='true'&&r.category==='prices'));
 user.role='viewer';user.is_superuser=false;user.permissions=['items:read'];
 await page.evaluate(user=>localStorage.setItem('onegemmy_token','test.'+btoa(JSON.stringify(user))+'.test'),user);
 await page.setViewportSize({width:1440,height:950});await page.goto(base+'/inventory/products');await actionButton().click();
 await page.getByRole('menuitem',{name:'View Details',exact:true}).waitFor();
 for(const name of ['Edit Product','Transfer Stock','Adjust Stock','Deactivate','Delete permanently']) assert.equal(await page.getByRole('menuitem',{name,exact:true}).count(),0);

 await browser.close();console.log('Passed: product navigation, list state, desktop/tablet/phone layouts, history filters, activity drawer, sales table, and filtered download.');
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
