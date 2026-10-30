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
const plain = value => JSON.parse(JSON.stringify(value));
const view = load('accessView.ts', () => { throw Error('no imports expected'); });
const nav = load('navigation.ts', name => { if (name !== 'lucide-react') throw Error(name); return new Proxy({}, { get: (_, key) => key }); });
const avail = load('moduleAvailability.ts', name => { if (name === './navigation') return nav; throw Error(name); });
const m = (status, can_view, can_change, effective_view, effective_change) => ({ status, can_view, can_change, effective_view, effective_change });

test('a person can use a module only when permissions and the business state both allow it', () => {
  assert.equal(view.moduleUse(m('enabled', true, true, true, true)).label, 'Can use');
  assert.equal(view.moduleUse(m('enabled', true, false, true, false)).label, 'View only');
  assert.equal(view.moduleUse(m('enabled', false, false, false, false)).label, 'No access');
});

test('a module the business turned off stays readable but cannot be changed, and stored permissions do not bypass restrictions', () => {
  const off = view.moduleUse(m('available', true, true, true, false));
  assert.equal(off.label, 'View only');
  assert.match(off.reason, /turned this module off/);
  assert.equal(view.moduleUse(m('not_included', true, true, false, false)).label, 'Not available');
  const restricted = view.moduleUse(m('restricted', true, true, false, false));
  assert.equal(restricted.label, 'Not available');
  assert.equal(restricted.tone, 'red');
});

test('summaries stay short and branch scope is told in words', () => {
  const names = { sales: 'Sales', inventory: 'Inventory', hr: 'HR', crm: 'CRM' };
  assert.deepEqual(plain(view.moduleSummary({ modules: ['sales', 'inventory', 'hr', 'crm'] }, names)), { shown: ['Sales', 'Inventory', 'HR'], more: 1 });
  assert.deepEqual(plain(view.moduleSummary({ modules: [] }, names)), { shown: [], more: 0 });
  assert.equal(view.branchLabel(true, []), 'All branches');
  assert.equal(view.branchLabel(false, []), 'None assigned');
  assert.equal(view.branchLabel(false, [{ name: 'Remera' }, { name: 'Kimironko' }]), 'Remera, Kimironko');
});

test('every module the menu controls has a home page, and the counts add up', () => {
  assert.equal(avail.moduleHref('inventory'), '/inventory');
  assert.equal(avail.moduleHref('procurement'), '/procurement');
  assert.equal(avail.moduleHref('appointments'), '/services');
  assert.equal(avail.moduleHref('nope'), null);
  const counts = avail.moduleCounts(['enabled', 'enabled', 'available', 'not_included', 'restricted'].map(status => ({ status })));
  assert.deepEqual(plain(counts), { included: 4, on: 2, off: 1, upgrade: 1, restricted: 1 });
});
