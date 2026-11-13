const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/importValues.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const api = {};
vm.runInNewContext(code, { exports: api });
const value = (input) => { const r = api.parseAmount(input); return r.ok ? r.value : r.reason; };

test('formatted amounts from Excel read as numbers', () => {
  assert.equal(value('2,500'), 2500);
  assert.equal(value('RWF 5,000'), 5000);
  assert.equal(value('5,000 Frw'), 5000);
  assert.equal(value('Frw5000'), 5000);
  assert.equal(value(' 1,250,000.50 '), 1250000.5);
  assert.equal(value('2 500'), 2500);
  assert.equal(value('2 500'), 2500);
  assert.equal(value('12.5'), 12.5);
  assert.equal(value(2500), 2500);
  assert.equal(value('0'), 0);
});

test('text that is not a number is refused, never guessed', () => {
  for (const bad of ['abc', '2,500abc', '2,5', '12,34,5', '1.2.3', 'RWF', '5k', '--5', 'NaN', 'Infinity']) assert.equal(value(bad), 'not-a-number', bad);
  assert.equal(value(''), 'empty');
  assert.equal(value('   '), 'empty');
  assert.equal(value(undefined), 'empty');
});

test('dates must be real YYYY-MM-DD dates', () => {
  assert.equal(api.isIsoDate('2026-04-01'), true);
  assert.equal(api.isIsoDate('2026-02-30'), false);
  assert.equal(api.isIsoDate('01/04/2026'), false);
  assert.equal(api.isIsoDate('2026-4-1'), false);
});

const row = (extra) => ({ name: 'Soap', cost: '2,500', price: 'RWF 5,000', stock: '45', minstock: '10', ...extra });

test('a product row with formatted numbers is valid and carries the numbers', () => {
  const r = api.checkProductRow(row());
  assert.equal(r.issues.length, 0);
  assert.deepEqual([r.cost, r.price, r.stock, r.minStock], [2500, 5000, 45, 10]);
});

test('each problem names the column and the bad value', () => {
  const r = api.checkProductRow(row({ name: '', cost: '2,500abc', price: '-5', stock: '', expirydate: '13/04/2026', imageurl: 'http://x.test/a.jpg' }));
  const messages = JSON.parse(JSON.stringify(r.issues.map((i) => i.message)));
  assert.deepEqual(messages, [
    'Name is required',
    "Cost: '2,500abc' is not a number",
    "Price can't be negative ('-5')",
    'Stock is required',
    "Expiry must be YYYY-MM-DD (got '13/04/2026')",
    "Picture link must start with https:// (got 'http://x.test/a.jpg')",
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(r.issues.map((i) => i.column))), ['name', 'cost', 'price', 'stock', 'expirydate', 'imageurl']);
});

test('the summary lists the most common problems, one count per row', () => {
  const rows = [row({ cost: 'x' }), row({ cost: 'y', price: 'z' }), row({ cost: '1,0' }), row({ price: 'q' }), row()].map((r) => api.checkProductRow(r).issues);
  assert.deepEqual(JSON.parse(JSON.stringify(api.summarizeIssues(rows))), [{ label: 'invalid Cost', rows: 3 }, { label: 'invalid Price', rows: 2 }]);
});

test('CSV keeps quoted thousands in one cell', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(api.parseCsv('name,cost\r\n"Soap, bar","2,500"\nOil,"say ""hi"""\n\n'))), [['name', 'cost'], ['Soap, bar', '2,500'], ['Oil', 'say "hi"']]);
});
