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

test('keeps all existing primary modules independent and in the requested group order', () => {
  const expected = [
    ['Dashboard'], ['Sales','Services','Inventory','Purchases','Customers'],
    ['Debt Management','Expense Management','Accounting'],
    ['Manufacturing','Branch Management','HR','Reports'], ['Settings','Help & Support'],
  ];
  assert.deepEqual(plain(nav.PRIMARY_NAV_GROUPS.map(group => group.items.map(item => item.name))), expected);
  const hrefs = nav.PRIMARY_NAV_GROUPS.flatMap(group => group.items.map(item => item.href));
  assert.equal(hrefs.length, new Set(hrefs).size);
});
test('reuses existing feature and permission gates without industry assumptions', () => {
  const all = nav.visiblePrimaryNavigation(undefined, () => true).flatMap(group => group.items.map(item => item.name));
  assert.equal(all.length, 15);
  const denied = nav.visiblePrimaryNavigation(undefined, () => false).flatMap(group => group.items.map(item => item.name));
  assert.deepEqual(plain(denied), ['Dashboard','Branch Management','Reports','Settings','Help & Support']);
  const disabled = nav.visiblePrimaryNavigation({services:false}, () => true).flatMap(group => group.items.map(item => item.name));
  assert.equal(disabled.includes('Services'), false);
  assert.equal(disabled.includes('Manufacturing'), true);
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
