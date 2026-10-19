const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/purchaseAmounts.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const api = {};
vm.runInNewContext(code, { exports: api });

test('calculates purchase totals and fractional quantities without float accumulation', () => {
  assert.equal(api.purchaseLineMinor('12.50', '2'), 2500n);
  assert.equal(api.purchaseLineMinor('0.10', '0.1'), 1n);
  assert.equal(api.purchaseLineMinor('1.00', '1.005'), 101n);
  assert.equal(api.purchaseLineMinor('0', '2'), 0n);
});
test('rejects invalid purchase costs and quantities instead of defaulting them', () => {
  for (const value of ['', '-1', '1.001', '1e3', 'Infinity']) assert.equal(api.purchaseLineMinor(value, '1'), null);
  for (const value of ['', '0', '-1', '0.0001']) assert.equal(api.purchaseLineMinor('1', value), null);
});
