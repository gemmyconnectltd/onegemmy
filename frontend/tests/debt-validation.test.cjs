const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/debts.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const api = {};
vm.runInNewContext(code, { exports: api });

test('accepts a partial payment and an exact full settlement', () => {
  assert.equal(api.paymentError('10.01', '20.02'), null);
  assert.equal(api.paymentError('20.02', '20.02'), null);
});
test('rejects an overpayment of one minor unit without floating-point rounding', () => {
  assert.equal(api.paymentError('100000000000.02', '100000000000.01'), 'The payment cannot exceed the outstanding balance.');
  assert.equal(api.minorUnits('9007199254740993.99'), 900719925474099399n);
});
test('rejects zero, negative, non-finite, exponent and excess-precision amounts', () => {
  for (const value of ['', '0', '0.00', '-1', 'NaN', 'Infinity', '1e2', '0.001']) assert.ok(api.paymentError(value, '100'));
});
test('requires a verifiable backend balance', () => {
  assert.equal(api.paymentError('1', 'not available'), 'The balance could not be verified. Refresh this record before paying.');
});
test('write-off and void need a real reason', () => {
  for (const value of ['', '  ', 'ab']) assert.ok(api.reasonError(value));
  assert.equal(api.reasonError('Customer closed'), null);
});
test('aging buckets are the four agreed ranges', () => {
  assert.deepEqual([...api.AGING_BUCKETS], ['0-30', '31-60', '61-90', '90+']);
});
