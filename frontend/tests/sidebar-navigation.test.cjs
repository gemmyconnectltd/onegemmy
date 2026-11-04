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

const enabled = Object.fromEntries(navigation.PRIMARY_NAV_GROUPS.flatMap(g => g.items).filter(i => i.feature).map(i => [i.feature, true]));
const hrefs = groups => Array.from(groups.flatMap(g => g.items).map(i => i.href));
test('all menus omit disabled modules, unavailable business features, and unauthorized administration', () => {
  const groups = sidebar.sidebarPrimaryNavigation({...enabled, manufacturing:false}, m => !['inventory','expenses','debts','accounting'].includes(m), () => false, false);
  const links=hrefs(groups);
  for(const href of ['/inventory','/expenses','/debts','/accounting','/manufacturing','/settings/users','/dashboard','/reports']) assert(!links.includes(href),href);
  assert(links.includes('/sales'));
  assert(links.includes('/pos'));
  assert(links.includes('/support'));
  assert(groups.every(g=>g.items.length>0));
});
test('unknown entitlements never flash business modules into navigation', () => {
  const links=hrefs(sidebar.sidebarPrimaryNavigation(undefined,()=>true,()=>true,false));
  assert(!links.includes('/inventory')&&!links.includes('/sales')&&!links.includes('/pos'));
});
test('owners still obey disabled business features; secondary menus obey resource grants', () => {
  assert(!hrefs(sidebar.sidebarPrimaryNavigation({...enabled,inventory:false},()=>true,()=>true,true)).includes('/inventory'));
  assert.equal(sidebar.sidebarModuleLinks('inventory',()=>true,false).length,0);
  assert.equal(sidebar.sidebarModuleLinks('procurement',()=>false,true).some(i=>i.requires),false);
  assert.equal(navigation.firstAllowedHref({...enabled,sales:false},()=>false,()=>false,false),'/support');
  assert.equal(navigation.firstAllowedHref(enabled,m=>m==='sales',()=>false,false),'/sales');
});

test('disabled service subfeatures are absent and fallback landing cannot loop through appointments', () => {
  const features={services:true,appointments:false,queue:false};
  const links=sidebar.sidebarModuleLinks('services',()=>true,true,features);
  assert(!links.some(i=>['/services/appointments','/services/calendar','/services/walk-ins'].includes(i.href)));
  assert.equal(navigation.firstAllowedHref(features,m=>m==='services',()=>true,false),'/services/catalog');
});
