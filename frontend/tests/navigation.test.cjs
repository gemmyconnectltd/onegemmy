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
    ['Overview'], ['Sales','Services','Inventory','Purchases','Manufacturing'], ['Customers'],
    ['Expenses','Debt Management','Accounting'], ['HR'], ['Reports'],
    ['Team & Access','Branches','Subscription & Billing','Business Settings','Help & Support'],
  ];
  assert.deepEqual(plain(nav.PRIMARY_NAV_GROUPS.map(group => group.items.map(item => item.name))), expected);
  assert.deepEqual(plain(nav.PRIMARY_NAV_GROUPS.map(group => group.label)), ['Workspace','Operations','Relationships','Finance','People','Insights','Administration']);
  const hrefs = nav.PRIMARY_NAV_GROUPS.flatMap(group => group.items.map(item => item.href));
  assert.equal(hrefs.length, new Set(hrefs).size);
  assert.equal(new Set(nav.PRIMARY_NAV_GROUPS.map(group => group.id)).size, nav.PRIMARY_NAV_GROUPS.length);
});
test('reuses feature, module and permission gates and never returns an empty group', () => {
  const names = groups => groups.flatMap(group => group.items.map(item => item.name));
  assert.equal(names(nav.visiblePrimaryNavigation(undefined, () => true, () => true)).length, 16);
  assert.equal(names(nav.visiblePrimaryNavigation(undefined, () => true, () => true)).includes('Subscription & Billing'), false);
  const denied = nav.visiblePrimaryNavigation(undefined, () => false, () => false);
  assert.deepEqual(plain(names(denied)), ['Overview','Reports','Business Settings','Help & Support']);
  assert.ok(denied.every(group => group.items.length > 0));
  const disabled = names(nav.visiblePrimaryNavigation({services:false}, () => true, () => true));
  assert.equal(disabled.includes('Services'), false);
  assert.equal(disabled.includes('Manufacturing'), true);
  const onlyUsers = names(nav.visiblePrimaryNavigation(undefined, () => false, p => p === 'users:read'));
  assert.deepEqual(plain(onlyUsers), ['Overview','Reports','Team & Access','Business Settings','Help & Support']);
});
test('a cashier-like user sees no finance, people or administration clutter', () => {
  const cashier = new Set(['sales']);
  const groups = nav.visiblePrimaryNavigation(undefined, module => cashier.has(module), () => false);
  const names = groups.flatMap(group => group.items.map(item => item.name));
  assert.deepEqual(plain(names), ['Overview','Sales','Reports','Business Settings','Help & Support']);
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
  assert.equal(nav.isPrimaryActive('/branches/abc', byName['Branches']), true);
  assert.equal(nav.isPrimaryActive('/dashboard', nav.PRIMARY_NAV_GROUPS[0].items[0]), true);
  assert.equal(nav.isPrimaryActive('/sales/orders', nav.PRIMARY_NAV_GROUPS[1].items[0]), true);
  assert.equal(nav.isPrimaryActive('/sales-reports', nav.PRIMARY_NAV_GROUPS[1].items[0]), false);
});
test('second sidebar has a title for every module and groups long lists', () => {
  const settings = can => nav.visibleModuleLinks('settings', can);
  assert.deepEqual(plain(settings(() => true)), []);  // Settings has no second sidebar: its pages live in the main sidebar
  for (const key of Object.keys(nav.MODULE_NAV)) assert.ok(nav.MODULE_TITLES[key] && nav.MODULE_TITLES[key].title && nav.MODULE_TITLES[key].blurb, key);
  const inventory = nav.MODULE_NAV.inventory.filter(link => link.group).map(link => link.group);
  assert.deepEqual(plain([...new Set(inventory)]), ['Catalog','Stock']);
});
test('both sidebar surfaces use the same expense, debt and accounting module links', () => {
  assert.deepEqual(plain(nav.MODULE_NAV.expenses.map(item => item.href)), ['/expenses','/expenses/list','/expenses/categories']);
  assert.deepEqual(plain(nav.MODULE_NAV.debts.map(item => item.href)), plain(nav.DEBT_NAV.map(item => item.href)));
  assert.deepEqual(plain(nav.MODULE_NAV.accounting.map(item => item.href)), plain(nav.ACCOUNTING_NAV.map(item => item.href)));
});
test('deep links activate the correct submenu without highlighting a sibling overview', () => {
  assert.equal(nav.isModuleLinkActive('/sales/orders', nav.MODULE_NAV.sales[0]), false);
  assert.equal(nav.isModuleLinkActive('/sales/orders', nav.MODULE_NAV.sales[1]), true);
  assert.equal(nav.isModuleLinkActive('/expenses/new', nav.MODULE_NAV.expenses[1]), true);
  assert.equal(nav.isModuleLinkActive('/sales/orders-unrelated', nav.MODULE_NAV.sales[1]), false);
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
  const catalogue = new Set(['accounting', 'appointments', 'crm', 'hr', 'inventory', 'manufacturing', 'procurement', 'queue', 'repairs', 'sales', 'services']);
  const used = nav.PRIMARY_NAV_GROUPS.flatMap(group => group.items).map(item => item.feature).filter(Boolean);
  assert.ok(used.length > 0);
  for (const key of used) assert.ok(catalogue.has(key), key);
  assert.equal(names(nav.visiblePrimaryNavigation({ sales: false }, () => true, () => true)).includes('Customers'), false);

  function names(groups) { return groups.flatMap(group => group.items.map(item => item.name)); }
});

test('the Overview and Reports are for the business owner only', () => {
  const names = groups => groups.flatMap(group => group.items.map(item => item.name));
  const everyone = names(nav.visiblePrimaryNavigation(undefined, () => true, () => true, false));
  assert.equal(everyone.includes('Overview'), false);
  assert.equal(everyone.includes('Reports'), false);
  assert.equal(everyone.includes('Sales'), true); // their own modules are unaffected
  const owner = names(nav.visiblePrimaryNavigation(undefined, () => true, () => true, true));
  assert.ok(owner.includes('Overview') && owner.includes('Reports'));
  // Someone who can only do HR lands on HR, never on the owner's Overview.
  const hrOnly = module => module === 'hr';
  assert.equal(nav.firstAllowedHref(undefined, hrOnly, () => false, false), '/hr');
  assert.equal(nav.firstAllowedHref(undefined, () => false, () => false, false), '/settings');
  assert.equal(nav.firstAllowedHref(undefined, hrOnly, () => false, true), '/dashboard');
});
