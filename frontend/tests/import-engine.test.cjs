const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/importEngine.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const api = {};
vm.runInNewContext(code, { exports: api });
const plain = (v) => JSON.parse(JSON.stringify(v));

const PRODUCT = [
  { key: 'name', label: 'Name', required: true }, { key: 'sku', label: 'SKU', unique: true }, { key: 'category', label: 'Category' },
  { key: 'cost', label: 'Cost', required: true, numeric: true }, { key: 'price', label: 'Price', required: true, numeric: true },
  { key: 'stock', label: 'Stock', required: true, numeric: true }, { key: 'minstock', label: 'Min Stock', required: true, numeric: true },
  { key: 'expirydate', label: 'Expiry' }, { key: 'barcode', label: 'Barcode', unique: true },
];

test("a client's own headings are recognised without the template", () => {
  const m = plain(api.autoMap(['Item Description', 'Item Code', 'Buying Price', 'Retail Price', 'Qty', 'Reorder Level', 'Supplier Notes'], PRODUCT));
  assert.deepEqual(m.map((x) => x.field), ['name', 'sku', 'cost', 'price', 'stock', 'minstock', '']);
  assert.ok(m.slice(0, 6).every((x) => x.confidence === 'exact'));
  assert.equal(m[6].confidence, 'none');
});

test('template headings match exactly and each field is used once', () => {
  const m = plain(api.autoMap(['name', 'SKU', 'cost', 'price', 'stock', 'minStock', 'Product'], PRODUCT));
  assert.deepEqual(m.map((x) => x.field), ['name', 'sku', 'cost', 'price', 'stock', 'minstock', '']);
});

test('a partial heading is matched but marked to check, and "Date" alone is not an expiry date', () => {
  const m = plain(api.autoMap(['Selling Price (RWF)', 'Date'], PRODUCT));
  assert.deepEqual(m[0], { field: 'price', confidence: 'likely' });
  assert.deepEqual(m[1], { field: '', confidence: 'none' });
});

test('the heading row is found below a title and blank lines', () => {
  const grid = [['Kigali Shop stock list', '', ''], ['November 2026', '', ''], ['Product', 'Buying Price', 'Qty'], ['Soap', '2500', '4']];
  assert.equal(api.detectHeaderRow(grid, PRODUCT), 2);
  assert.equal(api.detectHeaderRow([['a', 'b'], ['1', '2']], PRODUCT), 0);
});

test("row values follow the matched columns, the person's edits win", () => {
  const mapping = [{ field: 'name', confidence: 'exact' }, { field: '', confidence: 'none' }, { field: 'cost', confidence: 'exact' }];
  assert.deepEqual(plain(api.rowValues([' Soap ', 'x', '2,500'], mapping, { cost: '2600' })), { name: 'Soap', cost: '2600' });
});

test('a value repeated in the same file is flagged on the later row only', () => {
  const rows = [
    { id: 1, label: 2, values: { sku: 'A-1' } }, { id: 2, label: 3, values: { sku: 'a 1' } }, { id: 3, label: 4, values: { sku: '' } },
    { id: 4, label: 5, values: { sku: '' } }, { id: 5, label: 6, values: { sku: 'B', barcode: '99' } }, { id: 6, label: 7, values: { barcode: '99' } },
  ];
  assert.deepEqual(plain([...api.inFileDuplicates(rows, PRODUCT)]), [[2, 'Same SKU as row 2'], [6, 'Same Barcode as row 6']]);
});

test('the same problem on many rows becomes one group, errors before warnings', () => {
  const issues = (n) => [{ column: 'minstock', message: 'Min Stock is required', summary: 'missing Min Stock' }].slice(0, n);
  const rows = Array.from({ length: 91 }, (_, i) => ({ id: i, issues: issues(1) }));
  rows.push({ id: 200, issues: [{ column: 'category', message: "Category 'X' isn't in Pesaa yet", summary: 'category not in Pesaa', level: 'warning' }] });
  rows.push({ id: 201, issues: [{ column: 'cost', message: "Cost: 'x' is not a number", summary: 'invalid Cost' }, { column: 'cost', message: 'again', summary: 'invalid Cost' }] });
  const groups = plain(api.groupIssues(rows));
  assert.deepEqual(groups.map((g) => [g.label, g.level, g.ids.length]), [['missing Min Stock', 'error', 91], ['invalid Cost', 'error', 1], ['category not in Pesaa', 'warning', 1]]);
  assert.equal(api.groupSentence(groups[0], 'product'), '91 products are missing Min Stock');
  assert.equal(api.groupSentence(groups[1], 'product'), '1 product: unreadable Cost');
});
