const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/saleDocument.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const api = {};
vm.runInNewContext(code, { exports: api, require: () => ({}) });
const order = { id: 'o1', order_number: 'ORD-1', payment_method: 'mobile', customer: { name: 'Ann' }, notes: null, subtotal: 100, discount: 0, tax: 0, total: 100, change_due: null,
  ordered_at: '2026-10-01T10:00:00Z', created_at: null, amount_paid: 40, outstanding_balance: 60, due_date: '2026-11-01',
  items: [{ id: 'i1', product_id: 'p1', variant_id: null, product_name: 'Pen', sku: 'P', variant_attributes: null, unit_price: 50, quantity: 2, discount: 0 }] };

test('any saved order becomes the POS receipt model', () => {
  const sale = api.orderToSale(order);
  assert.equal(sale.orderId, 'ORD-1'); assert.equal(sale.backendOrderId, 'o1'); assert.equal(sale.payment, 'mobile');
  assert.equal(sale.balanceDue, 60); assert.equal(sale.amountPaid, 40); assert.equal(sale.items[0].qty, 2); assert.equal(sale.customerName, 'Ann');
});
test('unknown payment methods fall back to cash', () => {
  assert.equal(api.orderToSale({ ...order, payment_method: 'credit' }).payment, 'cash');
});
