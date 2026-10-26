import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(`${root}super-admin/package.json`);
const ts = require('typescript');
const source = readFileSync(`${root}super-admin/src/components/shell/nav.ts`, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const nav = {};
new Function('require', 'exports', compiled.outputText)((name) => (name === 'lucide-react' ? new Proxy({}, { get: (_, key) => key }) : require(name)), nav);

test('the sidebar is grouped, every module appears exactly once and no group is empty', () => {
  const items = nav.NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
  assert.equal(new Set(items).size, items.length);
  assert.ok(nav.NAV_GROUPS.every((g) => g.items.length > 0 && g.label));
  assert.deepEqual(items, nav.NAV_ITEMS.map((i) => i.href));
  assert.deepEqual(nav.NAV_GROUPS.map((g) => g.label), ['Overview', 'Business', 'Revenue', 'Growth', 'Support', 'Platform']);
  for (const href of ['/', '/tenants', '/plans', '/traffic', '/marketing', '/usage', '/support', '/settings']) assert.ok(items.includes(href), href);
});

test('every portal page resolves to a navigation entry and a sensible breadcrumb', () => {
  const crumbs = (p) => nav.breadcrumbFor(p);
  assert.deepEqual(crumbs('/'), ['Overview']);
  assert.deepEqual(crumbs('/tenants'), ['Tenants']);
  assert.deepEqual(crumbs('/tenants/abc'), ['Tenants', 'Details']);
  assert.deepEqual(crumbs('/usage'), ['Usage']);
  assert.deepEqual(crumbs('/settings'), ['Settings']);
  assert.deepEqual(crumbs('/marketing'), ['Marketing', 'Overview']);
  assert.deepEqual(crumbs('/marketing/campaigns'), ['Marketing', 'Campaigns']);
  assert.deepEqual(crumbs('/marketing/campaigns/abc'), ['Marketing', 'Campaigns', 'Details']);
  assert.deepEqual(crumbs('/marketing/automations/abc'), ['Marketing', 'Automations', 'Details']);
  assert.deepEqual(crumbs('/traffic'), ['Traffic', 'Website', 'Overview']);
  assert.deepEqual(crumbs('/erp-traffic/devices'), ['Traffic', 'ERP', 'Devices']);
  assert.deepEqual(crumbs('/support/tickets'), ['Customer Support', 'Tickets']);
  assert.deepEqual(crumbs('/plans'), ['Plans & Billing', 'Plans']);
  assert.deepEqual(crumbs('/invoices/abc'), ['Plans & Billing', 'Invoices', 'Details']);
  assert.ok(!crumbs('/erp-traffic').includes('Erp-traffic'));
});

test('the shared drawer protects unsaved changes and the shell is keyboard accessible', () => {
  const drawer = readFileSync(`${root}super-admin/src/components/ui/Drawer.tsx`, 'utf8');
  assert.match(drawer, /dirty\?: boolean/);
  assert.match(drawer, /role="alertdialog"/);
  const sidebar = readFileSync(`${root}super-admin/src/components/shell/Sidebar.tsx`, 'utf8');
  assert.ok(!sidebar.includes('onMouseEnter'), 'the account menu must not depend on hover');
  assert.match(sidebar, /aria-expanded/);
  assert.match(sidebar, /<Drawer/);
});
