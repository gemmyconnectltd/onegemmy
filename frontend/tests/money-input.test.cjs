const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/moneyInput.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const api = {};
vm.runInNewContext(code, { exports: api });

test('typing keeps digits and one decimal point, limited to the currency decimals', () => {
  assert.equal(api.sanitizeAmount('1,250.50', 2), '1250.50');  // a pasted figure with thousands commas
  assert.equal(api.sanitizeAmount('1,250,000', 0), '1250000');
  assert.equal(api.sanitizeAmount('12,5', 2), '12.5');          // a decimal comma
  assert.equal(api.sanitizeAmount('12.345', 2), '12.34');
  assert.equal(api.sanitizeAmount('1e3', 2), '13');
  assert.equal(api.sanitizeAmount('abc', 2), '');
  assert.equal(api.sanitizeAmount('007', 2), '7');
  assert.equal(api.sanitizeAmount('.5', 2), '0.5');
  assert.equal(api.sanitizeAmount('12.5', 0), '125');  // a zero-decimal currency (RWF) has no fraction
  assert.equal(api.sanitizeAmount('1.2.3', 2), '1.23');
});
test('only complete positive amounts within the decimals are valid', () => {
  assert.equal(api.isPositiveAmount('100', 0), true);
  assert.equal(api.isPositiveAmount('100.5', 0), false);
  assert.equal(api.isPositiveAmount('100.55', 2), true);
  assert.equal(api.isPositiveAmount('100.555', 2), false);
  for (const bad of ['', '0', '0.00', '-1', '1e3', 'Infinity']) assert.equal(api.isPositiveAmount(bad, 2), false);
});
test('grouping and padding are for display and never change the value', () => {
  assert.equal(api.groupThousands('1250000'), '1,250,000');
  assert.equal(api.groupThousands('1250000.5'), '1,250,000.5');
  assert.equal(api.groupThousands(''), '');
  assert.equal(api.padAmount('12.5', 2), '12.50');
  assert.equal(api.padAmount('12', 2), '12.00');
  assert.equal(api.padAmount('12', 0), '12');
  assert.equal(api.padAmount('', 2), '');
});
