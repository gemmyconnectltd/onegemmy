import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const load = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));

// Test the project's TypeScript modules with its existing compiler; no additional runner dependency.
load.extensions['.ts'] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  module._compile(result.outputText, filename);
};
const { couponStatus } = load(path.resolve(directory, '../src/lib/billing/logic.ts'));
const { trimInput } = load(path.resolve(directory, '../src/lib/api/client.ts'));

test('expired coupon wins over exhaustion and manual inactivity', () => {
  const coupon = { expiresAt: '2026-10-01T00:00:00Z', startsAt: null, redeemed: 50, maxRedemptions: 50, active: false };
  const now = Date.parse('2026-10-18T00:00:00Z');
  assert.equal(couponStatus(coupon, now), 'Expired');
  assert.equal(couponStatus({ ...coupon, expiresAt: null }, now), 'Exhausted');
  assert.equal(couponStatus({ ...coupon, expiresAt: null, redeemed: 49 }, now), 'Inactive');
  assert.equal(couponStatus({ ...coupon, expiresAt: null, redeemed: 49, active: true }, now), 'Active');
  assert.equal(couponStatus({ ...coupon, expiresAt: null, redeemed: 49, active: true, startsAt: '2026-11-01T00:00:00Z' }, now), 'Inactive');
});

test('request normalization trims nested human text while preserving credentials and amounts', () => {
  const source = { name: '  Shop  ', owner_email: '  owner@example.com ', amount: 1234,
    items: [{ city: ' Kigali ' }], password: ' secret bytes ', refresh_token: ' token bytes ' };
  assert.deepEqual(trimInput(source), { name: 'Shop', owner_email: 'owner@example.com', amount: 1234,
    items: [{ city: 'Kigali' }], password: ' secret bytes ', refresh_token: ' token bytes ' });
  assert.equal(source.name, '  Shop  ');
});
