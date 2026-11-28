const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/documentWords.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const w = {};
vm.runInNewContext(code, { exports: w });

test('a document is titled after its number', () => {
  assert.deepEqual({ ...w.saleDocument('INV-0017') }, { title: 'Invoice', dateLabel: 'Invoice date' });
  assert.deepEqual({ ...w.saleDocument('ORD-0097') }, { title: 'Order', dateLabel: 'Order date' });
  assert.deepEqual({ ...w.saleDocument('SO-0012') }, { title: 'Sales order', dateLabel: 'Order date' });
});

test('the receipt carries the same number, and file names follow the title', () => {
  assert.equal(w.receiptFor('INV-0017'), 'Receipt for invoice INV-0017');
  assert.equal(w.receiptFor('ORD-0097'), 'Receipt for order ORD-0097');
  assert.equal(w.documentFileName('Order', 'ORD-0097'), 'Order ORD-0097.pdf');
  assert.equal(w.documentFileName('Invoice', 'INV-0017'), 'Invoice INV-0017.pdf');
  assert.equal(w.documentFileName('Receipt', 'INV-0017'), 'Receipt INV-0017.pdf');
});
