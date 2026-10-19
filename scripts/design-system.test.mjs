import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { root, violations, check } from './check-design-system.mjs';
const tokens = JSON.parse(readFileSync(`${root}/design-system/tokens.json`, 'utf8'));
function luminance(hex) { const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; }
test('approved green meets large-text contrast and neutrals meet normal-text AA', () => {
  for (const color of [tokens.primary, tokens.primaryHover, tokens.primaryActive]) assert.ok(1.05 / (luminance(color) + .05) >= 3);
  for (const theme of [tokens.light, tokens.dark]) for (const text of ['foreground', 'muted']) { const a = luminance(theme[text]), b = luminance(theme.card); assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05) >= 4.5); }
});
test('checks reject literal colors, competing buttons, local tokens and custom fonts', () => {
  const found = violations('<button className="bg-green-600">New</button> text-[#123456] font-[Arial] --primary: #fff;', 'frontend/src/app/example.tsx');
  for (const name of ['literal-color','competing-action','custom-font','local-primary-token']) assert.equal(found[name], 1);
});
test('semantic states, chart colors and brand token usage stay valid', () => {
  assert.deepEqual(violations('bg-accent text-red-600 bg-emerald-500/10 text-amber-700', 'frontend/src/example.tsx'), {});
  assert.deepEqual(violations('bg-[#123456]', 'frontend/src/components/charts/Test.tsx'), {});
});
test('legacy allowance cannot hide new files or increased violations', () => {
  assert.equal(check({'a.tsx':{'literal-color':2}}, {'a.tsx':{'literal-color':1}}).length,1);
  assert.equal(check({'b.tsx':{'literal-color':1}}, {'a.tsx':{'literal-color':1}}).length,1);
  assert.equal(check({'a.tsx':{'literal-color':1}}, {'a.tsx':{'literal-color':2}}).length,0);
});

test('approved token contract stays explicit', () => {
  assert.equal(tokens.primary, '#16A34A');
  assert.equal(tokens.primaryHover, '#15803D');
  assert.equal(tokens.primaryActive, '#166534');
  assert.equal(tokens.primaryLight, '#F0FDF4');
  assert.deepEqual(tokens.button, {sm:32, default:40, lg:44, radius:8});
  assert.deepEqual(tokens.spacing, [4,8,12,16,24,32]);
});
test('duplicate generic buttons and page-specific table CSS fail', () => {
  assert.equal(violations('export function Button() {}', 'website/src/components/Button.tsx')['duplicate-button'], 1);
  assert.equal(violations('td { padding: 30px; }', 'frontend/src/app/page.css')['table-style'], 1);
  assert.equal(violations('--primary: var(--other-brand);', 'frontend/src/app/page.css')['local-primary-token'], 1);
  assert.equal(violations('font-family: "Comic Sans";', 'website/src/app/page.css')['font-family'], 1);
});

test('sidebar contract is shared and solid without decorative effects', () => {
  const css = readFileSync(`${root}/design-system/components.css`, 'utf8');
  assert.match(css, /\.pesaa-nav-row\s*\{[^}]*border: 0;[^}]*border-radius: 0;[^}]*box-shadow: none;/s);
  assert.match(css, /\.pesaa-nav-row\[data-active="true"\]\s*\{[^}]*background: var\(--primary\);[^}]*color: var\(--primary-foreground\);/s);
  for (const file of ['frontend/src/components/dashboard/Sidebar.tsx','frontend/src/components/dashboard/SecondSidebar.tsx','frontend/src/components/accounting/AccountingNavigation.tsx','frontend/src/components/debts/DebtNavigation.tsx','super-admin/src/components/shell/Sidebar.tsx','super-admin/src/components/ui/SecondaryNav.tsx']) {
    const source = readFileSync(`${root}/${file}`, 'utf8');
    assert.ok(source.includes('pesaa-nav-row'), file);
    assert.ok(source.includes('data-active='), file);
  }
});

test('competing blue actions cannot return through links', () => {
  assert.equal(violations('<Link className="bg-blue-600">Create</Link>', 'frontend/src/app/example.tsx')['competing-action'], 1);
  assert.deepEqual(violations('<Link className="bg-primary">Create</Link>', 'frontend/src/app/example.tsx'), {});
});
