const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/navigation.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020} }).outputText;
const nav = {};
vm.runInNewContext(code, {exports: nav, require: name => {if(name !== 'lucide-react')throw Error(name);return new Proxy({}, {get: (_, key) => key});}});
const plain = value => JSON.parse(JSON.stringify(value));

test('keeps every existing module and groups them by what people do', () => {
  const expected = [
    ['Overview'], ['Sales','Point of Sale','Discounts & Promotions','Services','Inventory','Purchases','Manufacturing'], ['Customers','CRM'],
    ['Expenses','Debt Management','Accounting'], ['HR'], ['Reports'],
    ['Team & Access','Approval Management','Branch Management','Subscription & Billing','Business Settings','Help & Support'],
  ];
  assert.deepEqual(plain(nav.PRIMARY_NAV_GROUPS.map(group => group.items.map(item => item.name))), expected);
  assert.deepEqual(plain(nav.PRIMARY_NAV_GROUPS.map(group => group.label)), ['Workspace','Operations','Relationships','Finance','People','Insights','Administration']);
  const hrefs = nav.PRIMARY_NAV_GROUPS.flatMap(group => group.items.map(item => item.href));
  assert.equal(hrefs.length, new Set(hrefs).size);
  assert.equal(new Set(nav.PRIMARY_NAV_GROUPS.map(group => group.id)).size, nav.PRIMARY_NAV_GROUPS.length);
});
const enabledFeatures = Object.fromEntries(nav.PRIMARY_NAV_GROUPS.flatMap(g => g.items).filter(i => i.feature).map(i => [i.feature,true]));
test('reuses feature, module and permission gates and never returns an empty group', () => {
  const names = groups => groups.flatMap(group => group.items.map(item => item.name));
  assert.equal(names(nav.visiblePrimaryNavigation(enabledFeatures, () => true, () => true)).length, 20);
  assert.equal(names(nav.visiblePrimaryNavigation(enabledFeatures, () => true, () => true)).includes('Subscription & Billing'), false);
  const denied = nav.visiblePrimaryNavigation(undefined, () => false, () => false);
  assert.deepEqual(plain(names(denied)), ['Overview','Reports','Help & Support']);
  assert.ok(denied.every(group => group.items.length > 0));
  const disabled = names(nav.visiblePrimaryNavigation({...enabledFeatures,services:false}, () => true, () => true));
  assert.equal(disabled.includes('Services'), false);
  assert.equal(disabled.includes('Manufacturing'), true);
  const salesDisabled = names(nav.visiblePrimaryNavigation({...enabledFeatures,sales:false,pos:false,discounts:false}, () => true, () => true));
  assert.equal(salesDisabled.includes('Sales'), false);
  assert.equal(salesDisabled.includes('Point of Sale'), false);
  // POS and Discounts are modules of their own: switching one off leaves Sales and the other in place.
  const posOff = names(nav.visiblePrimaryNavigation({...enabledFeatures,pos:false}, () => true, () => true));
  assert.deepEqual([posOff.includes('Sales'), posOff.includes('Point of Sale'), posOff.includes('Discounts & Promotions')], [true, false, true]);
  const discountsOff = names(nav.visiblePrimaryNavigation({...enabledFeatures,discounts:false}, () => true, () => true));
  assert.deepEqual([discountsOff.includes('Sales'), discountsOff.includes('Point of Sale'), discountsOff.includes('Discounts & Promotions')], [true, true, false]);
  const onlyUsers = names(nav.visiblePrimaryNavigation(undefined, () => false, p => p === 'users:read'));
  assert.deepEqual(plain(onlyUsers), ['Overview','Reports','Team & Access','Help & Support']);
});
test('a cashier-like user sees no finance, people or administration clutter', () => {
  const cashier = new Set(['sales','pos']);
  const groups = nav.visiblePrimaryNavigation({sales:true,pos:true}, module => cashier.has(module), () => false);
  const names = groups.flatMap(group => group.items.map(item => item.name));
  assert.deepEqual(plain(names), ['Overview','Sales','Point of Sale','Reports','Help & Support']);
  assert.equal(groups.some(group => group.label === 'Finance' || group.label === 'People'), false);
});
test('Administration items activate on their own page only, not their siblings', () => {
  const admin = nav.PRIMARY_NAV_GROUPS.find(group => group.id === 'administration').items;
  const byName = Object.fromEntries(admin.map(item => [item.name, item]));
  assert.equal(nav.isPrimaryActive('/settings/users', byName['Team & Access']), true);
  assert.equal(nav.isPrimaryActive('/settings/users', byName['Business Settings']), false);
  assert.equal(nav.isPrimaryActive('/settings', byName['Business Settings']), true);
  assert.equal(nav.isPrimaryActive('/settings/security', byName['Business Settings']), true);
  assert.equal(nav.isPrimaryActive('/settings/billing', byName['Subscription & Billing']), true);
  assert.equal(nav.isPrimaryActive('/branches/abc', byName['Branch Management']), true);
  assert.equal(nav.isPrimaryActive('/dashboard', nav.PRIMARY_NAV_GROUPS[0].items[0]), true);
  assert.equal(nav.isPrimaryActive('/sales/orders', nav.PRIMARY_NAV_GROUPS[1].items[0]), true);
  const pointOfSale = nav.PRIMARY_NAV_GROUPS[1].items.find(item => item.href === '/pos');
  assert.equal(nav.isPrimaryActive('/pos', pointOfSale), true);
  assert.equal(nav.isPrimaryActive('/pos/checkout', pointOfSale), true);
  assert.equal(nav.isPrimaryActive('/sales-reports', nav.PRIMARY_NAV_GROUPS[1].items[0]), false);
});
test('second sidebar has a title for every module and groups long lists', () => {
  const settings = can => nav.visibleModuleLinks('settings', can);
  assert.deepEqual(plain(settings(() => true)), []);  // Settings has no second sidebar: its pages live in the main sidebar
  for (const key of Object.keys(nav.MODULE_NAV)) assert.ok(nav.MODULE_TITLES[key] && nav.MODULE_TITLES[key].title && nav.MODULE_TITLES[key].blurb, key);
  assert.deepEqual(plain(nav.MODULE_NAV.inventory.map(link => link.href)), [
    '/inventory',
    '/inventory/products',
    '/inventory/stock',
    '/inventory/transfers',
    '/inventory/warehouses',
    '/inventory/stock-by-warehouse',
    '/inventory/movements',
    '/inventory/counts',
  ]);
  assert.ok(nav.MODULE_NAV.inventory[0].exact);
  assert.deepEqual(plain(nav.MODULE_NAV.inventory.filter(link => link.group).map(link => link.group)), []);
});
test('both sidebar surfaces use the same expense, debt and accounting module links', () => {
  assert.deepEqual(plain(nav.MODULE_NAV.expenses.map(item => item.href)), ['/expenses/list','/expenses/categories']);
  assert.deepEqual(plain(nav.MODULE_NAV.debts.map(item => item.href)), plain(nav.DEBT_NAV.map(item => item.href)));
  assert.deepEqual(plain(nav.MODULE_NAV.accounting.map(item => item.href)), plain(nav.ACCOUNTING_NAV.map(item => item.href)));
});
test('deep links activate the correct submenu without highlighting a sibling', () => {
  const primary = nav.PRIMARY_NAV_GROUPS.flatMap(group => group.items);
  const discounts = primary.find(item => item.name === 'Discounts & Promotions');
  const sales = primary.find(item => item.name === 'Sales');
  assert.equal(nav.isPrimaryActive('/sales/discounts/new', discounts), true);
  assert.equal(nav.isPrimaryActive('/sales/discounts/new', sales), false);
  assert.equal(nav.MODULE_NAV.sales.some(item => item.href === discounts.href), false);
  assert.equal(nav.isModuleLinkActive('/sales/orders', nav.MODULE_NAV.sales[0]), true);
  assert.equal(nav.isModuleLinkActive('/sales/returns', nav.MODULE_NAV.sales[0]), false);
  assert.equal(nav.isModuleLinkActive('/expenses/new', nav.MODULE_NAV.expenses[0]), true);
  assert.equal(nav.isModuleLinkActive('/sales/orders-unrelated', nav.MODULE_NAV.sales[0]), false);
});
test('Purchases and Inventory have operational overviews; other modules keep reports separate', () => {
  for (const [module, links] of Object.entries(nav.MODULE_NAV)) {
    if (module === 'reports' || module === 'procurement' || module === 'inventory') continue;
    assert.equal(links.some(link => /overview/i.test(String(link.nameKey)) || /overview/i.test(String(link.label ?? ''))), false, module);
  }
  assert.ok(nav.MODULE_NAV.procurement.some(link => link.href === '/procurement' && link.exact));
  assert.ok(nav.MODULE_NAV.inventory.some(link => link.href === '/inventory' && link.exact));
  for (const route of ['/procurement/orders', '/procurement/receipts', '/procurement/bills', '/procurement/returns']) assert.ok(nav.MODULE_NAV.procurement.some(link => link.href === route));
  assert.deepEqual(plain(nav.MODULE_NAV.reports.map(link => link.href)), ['/reports','/reports/sales','/reports/operations','/reports/finance']);
  assert.ok(nav.MODULE_NAV.sales.some(link => link.href === '/sales/deals'));
});

test('no page is listed twice: not across modules and not in both sidebars', () => {
  const second = Object.entries(nav.MODULE_NAV).flatMap(([module, links]) => links.map(link => ({module, href: link.href})));
  const hrefs = second.map(link => link.href);
  assert.deepEqual(plain(hrefs.filter((href, index) => hrefs.indexOf(href) !== index)), []);
  const primary = new Set(nav.PRIMARY_NAV_GROUPS.flatMap(group => group.items.map(item => item.href)));
  // The only overlap allowed is a module's own Overview, which is the page its main-sidebar link opens.
  const overlap = second.filter(link => primary.has(link.href) && !nav.MODULE_NAV[link.module].some(other => other.exact && other.href === link.href));
  assert.deepEqual(plain(overlap), []);
});
test('suppliers are managed under Purchases only', () => {
  assert.equal(Object.values(nav.MODULE_NAV).flat().filter(link => /suppliers$/.test(link.href)).length, 1);
  assert.ok(nav.MODULE_NAV.procurement.some(link => link.href === '/procurement/suppliers'));
});
test('every module a menu item depends on is a real feature in the platform catalogue', () => {
  // Mirrors the feature_flags catalogue; a key missing from it would make the module unreachable for every business.
  const catalogue = new Set(['accounting', 'appointments', 'crm', 'hr', 'inventory', 'manufacturing', 'procurement', 'queue', 'repairs', 'sales', 'services', 'discounts', 'pos']);
  const used = nav.PRIMARY_NAV_GROUPS.flatMap(group => group.items).map(item => item.feature).filter(Boolean);
  assert.ok(used.length > 0);
  for (const key of used) assert.ok(catalogue.has(key), key);
  assert.equal(names(nav.visiblePrimaryNavigation({ sales: false }, () => true, () => true)).includes('Customers'), false);

  function names(groups) { return groups.flatMap(group => group.items.map(item => item.name)); }
});

test('the Overview and Reports are for the business owner only', () => {
  const names = groups => groups.flatMap(group => group.items.map(item => item.name));
  const everyone = names(nav.visiblePrimaryNavigation({sales:true}, () => true, () => true, false));
  assert.equal(everyone.includes('Overview'), false);
  assert.equal(everyone.includes('Reports'), false);
  assert.equal(everyone.includes('Sales'), true); // their own modules are unaffected
  const owner = names(nav.visiblePrimaryNavigation(undefined, () => true, () => true, true));
  assert.ok(owner.includes('Overview') && owner.includes('Reports'));
  // Someone who can only do HR lands on HR, never on the owner's Overview.
  const hrOnly = module => module === 'hr';
  assert.equal(nav.firstAllowedHref({hr:true}, hrOnly, () => false, false), '/hr');
  assert.equal(nav.firstAllowedHref(undefined, () => false, () => false, false), '/support');
  assert.equal(nav.firstAllowedHref(undefined, hrOnly, () => false, true), '/dashboard');
});
