const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const load = (file, requires) => {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => requires(name) });
  return exports;
};
const nav = load('navigation.ts', name => { if (name !== 'lucide-react') throw Error(name); return new Proxy({}, { get: (_, key) => key }); });
const mod = load('moduleAvailability.ts', name => { if (name === './navigation') return nav; throw Error(name); });
// Values built inside the vm sandbox have a different prototype; compare plain copies.
const plain = value => JSON.parse(JSON.stringify(value));
const link = (key, status) => ({ key, name: key[0].toUpperCase() + key.slice(1), status });
const module_ = (status, needs = [], needed_by = []) => ({ status, needs, needed_by });

test('a page is tied to the module that controls it, including POS and the customer and finance pages', () => {
  assert.deepEqual(plain(mod.featureForPath('/pos')), { key: 'sales', name: 'Sales & POS' });
  assert.equal(mod.featureForPath('/pos/checkout').key, 'sales');
  assert.equal(mod.featureForPath('/inventory/products').key, 'inventory');
  assert.equal(mod.featureForPath('/customers/123').key, 'sales');
  assert.equal(mod.featureForPath('/expenses/list').key, 'accounting');
  assert.equal(mod.featureForPath('/debts/receivables').key, 'accounting');
  assert.equal(mod.featureForPath('/manufacturing/bom').key, 'manufacturing');
});

test('pages every business has are never blocked by a module', () => {
  for (const p of ['/dashboard', '/settings', '/settings/features', '/settings/billing', '/support', '/reports', '/branches', '/settings/users']) assert.equal(mod.featureForPath(p), null, p);
});

test('explains why a module is unavailable in plain words', () => {
  assert.match(mod.unavailableReason('Manufacturing', 'not_included'), /isn't part of your current plan/);
  assert.match(mod.unavailableReason('HR', 'available'), /turned off/);
  assert.match(mod.unavailableReason('Sales', 'restricted'), /paused/);
  assert.match(mod.unavailableReason('Sales', undefined), /plan/); // an older server without module states still gets a sensible message
});

test('filters list the right modules', () => {
  const rows = ['enabled', 'available', 'not_included', 'restricted'].map(status => ({ status }));
  const pick = f => rows.filter(r => mod.matchesFilter(r, f)).map(r => r.status);
  assert.deepEqual(plain(pick('all')), ['enabled', 'available', 'not_included', 'restricted']);
  assert.deepEqual(plain(pick('on')), ['enabled']);
  assert.deepEqual(plain(pick('off')), ['available']);
  assert.deepEqual(plain(pick('upgrade')), ['not_included']);
});

test('dependency conflicts are named before the administrator tries', () => {
  // Turning Manufacturing on needs Inventory on; turning Inventory off needs Manufacturing off.
  assert.deepEqual(plain(mod.switchBlockers(module_('available', [link('inventory', 'available')])).turnOnFirst), ['Inventory']);
  assert.deepEqual(plain(mod.switchBlockers(module_('available', [link('inventory', 'enabled')])).turnOnFirst), []);
  assert.deepEqual(plain(mod.switchBlockers(module_('enabled', [], [link('manufacturing', 'enabled'), link('procurement', 'available')])).turnOffFirst), ['Manufacturing']);
  assert.deepEqual(plain(mod.switchBlockers(module_('not_included', [link('inventory', 'available')], [link('x', 'enabled')]))), { turnOnFirst: [], turnOffFirst: [] });
});

test('a page is open only to people whose role gives them its module or permission, read the way the menu reads it', () => {
  assert.deepEqual(plain(mod.accessForPath('/hr/attendance')), { name: 'HR', module: 'hr' });
  assert.deepEqual(plain(mod.accessForPath('/pos')), { name: 'Sales', module: 'sales' });
  assert.deepEqual(plain(mod.accessForPath('/settings/users')), { name: 'Team & Access', permission: 'users:read' });
  assert.deepEqual(plain(mod.accessForPath('/settings/billing')), { name: 'Subscription & Billing', permission: 'billing:read' });
  for (const open of ['/settings', '/support']) assert.equal(mod.accessForPath(open), null, open);
  assert.deepEqual(plain(mod.accessForPath('/dashboard')), { name: 'Overview', ownerOnly: true });  // the Overview and Reports are the owner's
  assert.deepEqual(plain(mod.accessForPath('/reports/daily')), { name: 'Reports', ownerOnly: true });
  assert.equal(mod.accessForPath('/somewhere/else'), null);
});
