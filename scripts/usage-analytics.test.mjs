import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const backend = readFileSync("backend/app/modules/admin/usage.py", "utf8");
const shared = readFileSync("super-admin/src/components/usage/UsageShared.tsx", "utf8");

test("engagement thresholds in the UI match the backend definition", () => {
  assert.match(backend, /== 0, "dormant"\).*< 10, "light"\).*< 50, "moderate"/s);
  assert.match(shared, /dormant: "No orders", light: "1–9 orders", moderate: "10–49 orders", heavy: "50\+ orders"/);
});

test("every module key the page accepts is a backend module", () => {
  const ui = readFileSync("super-admin/src/app/(portal)/usage/modules/[key]/page.tsx", "utf8").match(/const KEYS = \[(.*?)\]/)[1].match(/"(\w+)"/g).map((k) => k.replaceAll('"', ""));
  const api = [...backend.matchAll(/^    \("(\w+)", "[^"]+", \w+, /gm)].map((m) => m[1]);
  assert.deepEqual([...ui].sort(), [...api].sort());
});

test("overview, drill-down pages and tenant tab are all linked", () => {
  for (const href of ["/usage/engagement/", "/usage/sales/", "/usage/modules/"]) assert.ok(shared.includes(href), href);
  assert.ok(readFileSync("super-admin/src/app/(portal)/tenants/[id]/TenantPanels.tsx", "utf8").includes("useUsageTenant"));
});
