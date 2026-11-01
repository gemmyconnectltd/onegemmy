const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/sessionAccess.ts'), 'utf8');
const api = {};
vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, {exports: api});
const session = {id: 'u1', tenantId: 't1', role: 'branch manager', roleId: null, permissions: [], disabledModules: [], branchId: 'b1', branchName: 'Main', tenantSlug: 'business'};
const profile = {id: 'u1', tenant_id: 't1', role: 'branch manager', role_id: 'r1', permissions: ['items:read'], disabled_modules: [], branch_id: 'b1', branch_ids: null, full_name: 'Manager', email: 'manager@example.test', tenant_name: 'Business', is_superuser: false};
test('existing sessions gain restored permissions without logging out or trusting stale JWT grants', () => {
  const current = api.currentSessionUser(session, profile);
  assert.deepEqual(Array.from(current.permissions), ['items:read']);
  assert.equal(current.roleId, 'r1');
  assert.equal(current.tenantSlug, 'business');
});
test('empty server grants and disabled modules override stale access', () => {
  const current = api.currentSessionUser({...session, permissions: ['items:read'], isSuperuser: true}, {...profile, permissions: [], disabled_modules: ['inventory']});
  assert.equal(current.isSuperuser, false);
  assert.equal(current.permissions.length, 0);
  assert.deepEqual(Array.from(current.disabledModules), ['inventory']);
});
test('cached data from another user or tenant cannot grant permissions', () => {
  assert.equal(api.currentSessionUser(session, {...profile, id: 'other'}), session);
  assert.equal(api.currentSessionUser(session, {...profile, tenant_id: 'other'}), session);
  assert.equal(api.currentSessionUser(null, profile), null);
});
