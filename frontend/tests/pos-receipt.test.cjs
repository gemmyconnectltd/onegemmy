const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/orders.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const api = {};
vm.runInNewContext(code, { exports: api });
const order = { id: 'saved-id', order_number: 'SALE-0102', payment_method: 'card', notes: 'POS — cash', subtotal: 1200, discount: 100, tax: 168, total: 1100, amount_tendered: 700, change_due: 0, amount_paid: 700, outstanding_balance: 400, due_date: '2026-10-25', ordered_at: '2026-10-19T10:00:00Z', items: [{ id: 'line', product_id: 'product', product_name: 'Variant product', quantity: 2, unit_price: 600, discount: 100, variant_id: 'variant', variant_attributes: { Size: 'M' } }] };
test('receipt uses persisted reference, payment fields and monetary totals', () => {
  const sale = api.orderToSale(order);
  assert.equal(sale.backendOrderId, 'saved-id');
  assert.equal(sale.orderId, 'SALE-0102');
  assert.equal(sale.payment, 'card');
  for (const key of ['subtotal', 'discount', 'tax', 'total']) assert.equal(sale[key], order[key]);
  assert.equal(sale.amountPaid, 700);
  assert.equal(sale.balanceDue, 400);
  assert.equal(sale.cashGiven, '700');
  assert.equal(sale.dueDate, '2026-10-25');
  assert.equal(sale.timestamp.toISOString(), order.ordered_at.replace('Z', '.000Z'));
  assert.equal(sale.items[0].variant_id, 'variant');
  assert.equal(sale.items[0].discount, 100);
});
test('legacy payment notes remain supported and saved change is retained', () => {
  const sale = api.orderToSale({ ...order, payment_method: null, notes: 'POS — mobile', amount_paid: 1100, outstanding_balance: 0, amount_tendered: 1500, change_due: 400 });
  assert.equal(sale.payment, 'mobile');
  assert.equal(sale.change, 400);
  assert.equal(sale.balanceDue, 0);
});

test('printing isolates the receipt in its own document for every paper size', async () => {
  const printSource = fs.readFileSync(path.join(__dirname, '../src/lib/pos/printReceipt.ts'), 'utf8');
  const printCode = ts.transpileModule(printSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  for (const paper of ['58mm', '80mm', 'A4']) {
    const styles = [];
    const content = [];
    let printed = 0;
    let removed = false;
    let afterPrint;
    const receiptOnly = { receipt: 'SAVED-001', items: 200 };
    const doc = { images: [], fonts: { ready: Promise.resolve() }, open() {}, write(html) { assert(!html.includes('POS navigation')); }, close() {}, createElement: () => ({ textContent: '' }), head: { appendChild: style => styles.push(style) }, body: { scrollHeight: 10000, appendChild: node => content.push(node) } };
    const frame = { style: {}, dataset: {}, contentDocument: doc, contentWindow: { focus() {}, addEventListener(name, callback) { if (name === 'afterprint') afterPrint = callback; }, print() { printed++; assert.equal(content.length, 1); assert.equal(content[0], receiptOnly); } }, remove() { removed = true; } };
    const host = { createElement(tag) { assert.equal(tag, 'iframe'); return frame; }, body: { appendChild() {} } };
    const printApi = {};
    vm.runInNewContext(printCode, { exports: printApi, document: host, setTimeout() {}, window: { print() { throw Error('The application must never be printed'); } } });
    await printApi.printReceipt({ cloneNode(deep) { assert.equal(deep, true); return receiptOnly; } }, paper);
    assert.equal(printed, 1);
    assert(styles[0].textContent.includes(`size:${paper === 'A4' ? 210 : Number.parseInt(paper)}mm`));
    assert(styles[0].textContent.includes('max-height:none!important'));
    assert(!removed);
    afterPrint();
    assert(removed);
  }
});
