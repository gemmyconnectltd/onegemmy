const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/api/branchStock.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const v = {};
vm.runInNewContext(code, { exports: v, require: () => ({ request: () => null, qs: () => '' }) });

test('the branch picker is hidden with one branch, a short list up to five, searchable from six', () => {
  assert.equal(v.pickerKind(0), 'hidden');
  assert.equal(v.pickerKind(1), 'hidden');
  assert.equal(v.pickerKind(2), 'select');
  assert.equal(v.pickerKind(5), 'select');
  assert.equal(v.pickerKind(6), 'search');
  assert.equal(v.pickerKind(30), 'search');
  assert.equal(v.MAX_BRANCH_COLUMNS, 5);
});

test('stock is requested from the other branch holding the most, never from the branch that needs it or the shared row', () => {
  const names = new Map([['kgl', 'Kigali'], ['kyz', 'Kayonza'], ['hye', 'Huye']]);
  const cells = [{ branch_id: 'kgl', quantity: 22 }, { branch_id: 'kyz', quantity: 3 }, { branch_id: 'hye', quantity: 4 }, { branch_id: null, quantity: 90 }];
  assert.deepEqual(JSON.parse(JSON.stringify(v.bestSource(cells, names, 'kyz'))), { id: 'kgl', name: 'Kigali', quantity: 22 });
  assert.equal(v.bestSource([{ branch_id: 'kgl', quantity: 0 }], names, 'kyz'), null);
});

test('out of stock comes before low, then by name', () => {
  const rows = [{ status: 'ok', name: 'A' }, { status: 'low', name: 'B' }, { status: 'out', name: 'Z' }, { status: 'out', name: 'C' }];
  assert.deepEqual(JSON.parse(JSON.stringify(v.byUrgency(rows).map((r) => r.name))), ['C', 'Z', 'B', 'A']);
});
