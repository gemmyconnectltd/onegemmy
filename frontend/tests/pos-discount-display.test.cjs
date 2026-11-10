const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.join(__dirname, '../src/components/pos');
const ui = props => React.createElement('button', { disabled: props.disabled }, props.children);
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => {
    if (name === '@/lib/api/client') return { resolveUploadUrl: value => value };
    if (name === './constants') return { LOW_STOCK_THRESHOLD: 5 };
    if (name === './icons') return { productAccent: () => '#16A34A', getProductIcon: () => null, IconBadge: () => null };
    if (name === './ProductDiscountBadge') return load('ProductDiscountBadge.tsx');
    if (name === '@/components/ui/Button') return { Button: ui };
    if (name === '@/components/ui/Drawer') return { Drawer: () => null };
    if (name === '@/components/ui/Form') return { Field: () => null, Input: () => null, Select: () => null };
    return require(name);
  } });
  return exports;
}
const { ProductCard } = load('ProductCard.tsx');
const props = { product: { id: 'p', name: 'Phone', price: 100, stock: 5, category: 'Phones' }, inCartQty: 0, currencySymbol: 'RWF', fmt: String, onAdd() {}, onAddVariant() {}, onToggle() {} };
const pricing = { product_id: 'p', variant_id: null, original_unit_price: '100.00', unit_price: '90.00', savings: '10.00', offers: [{ rule_id: 'r', name: 'Weekend', type: 'percentage', label: '10% OFF', conditional: false }], price_context: 'Current cart', blocked: null };
const render = extra => renderToStaticMarkup(React.createElement(ProductCard, { ...props, ...extra }));
test('regular products have no offer badge or crossed-out price', () => {
  const html = render({});
  assert.ok(html.includes('Phone') && html.includes('5 in stock'));
  assert.ok(!html.includes('OFF') && !html.includes('line-through'));
});
test('verified percentage prices show original, final price and one badge', () => {
  const html = render({ pricing });
  assert.ok(html.includes('line-through') && html.includes('100') && html.includes('90') && html.includes('10% OFF'));
});
test('quantity and unapplied coupon offers do not invent single-unit savings', () => {
  for (const label of ['BUY 2 GET 1', 'VOLUME DEAL', 'COUPON OFFER']) {
    const html = render({ pricing: { ...pricing, unit_price: '100.00', savings: '0', offers: [{ ...pricing.offers[0], label, conditional: true }] } });
    assert.ok(html.includes(label));
    assert.ok(!html.includes('line-through'));
  }
});
test('blocked prices fall back to the regular amount', () => {
  const html = render({ pricing: { ...pricing, blocked: 'Below unit cost' } });
  assert.ok(!html.includes('line-through'));
});
test('manual discount entry is closed by default and respects settings/permission', () => {
  const { PosDiscounts } = load('PosDiscounts.tsx');
  const config = { settings: { enabled: true, manual_pos: true }, canApply: true, cart: [props.product], coupon: '', money: String };
  const html = renderToStaticMarkup(React.createElement(PosDiscounts, config));
  assert.ok(html.includes('+ Apply Discount'));
  assert.ok(!html.includes('Discount type'));
  assert.equal(renderToStaticMarkup(React.createElement(PosDiscounts, { ...config, settings: { enabled: false } })), '');
  assert.ok(!renderToStaticMarkup(React.createElement(PosDiscounts, { ...config, canApply: false })).includes('+ Apply Discount'));
});

test('an empty coupon error list does not render a stray zero', () => {
  const { PosDiscounts } = load('PosDiscounts.tsx');
  const html = renderToStaticMarkup(React.createElement(PosDiscounts, { settings: { enabled: true }, cart: [], coupon: '', money: String, pricing: { applied: [], coupon_errors: [], blocked: null } }));
  assert.ok(!html.includes('>0<'));
});
