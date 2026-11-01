const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, requireModule) {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib', file), 'utf8');
  const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
  const exports = {};
  vm.runInNewContext(code, {exports, require: requireModule});
  return exports;
}
const navigation = load('navigation.ts', name => {
  assert.equal(name, 'lucide-react');
  return new Proxy({}, {get: (_, key) => key});
});
const sidebar = load('sidebarNavigation.ts', name => {
  assert.equal(name, './navigation');
  return navigation;
});
test('discovery sidebar includes every published entry without role or feature predicates', () => {
  const expected = navigation.PRIMARY_NAV_GROUPS.flatMap(group => group.items).filter(item => !item.hidden).map(item => item.href);
  assert.deepEqual(Array.from(sidebar.sidebarPrimaryNavigation().flatMap(group => group.items).map(item => item.href)), Array.from(expected));
  assert.ok(sidebar.sidebarPrimaryNavigation().flatMap(group => group.items).some(item => item.href === '/sales'));
  assert.ok(sidebar.sidebarPrimaryNavigation().flatMap(group => group.items).some(item => item.href === '/inventory'));
});
test('secondary menu includes permission-tagged entries while route guards retain restricted landing rules', () => {
  for (const module of Object.keys(navigation.MODULE_NAV)) {
    assert.deepEqual(Array.from(sidebar.sidebarModuleLinks(module).map(item => item.href)), Array.from(navigation.MODULE_NAV[module].map(item => item.href)));
  }
  assert.equal(navigation.firstAllowedHref(undefined, () => false, () => false, false), '/support');
});
