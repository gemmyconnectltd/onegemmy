const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/branchView.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const v = {};
vm.runInNewContext(code, { exports: v });
const plain = x => JSON.parse(JSON.stringify(x));
const form = o => ({ name: 'Remera', location: '', phone: '', email: '', status: 'active', ...o });

test('a branch needs a name that no other branch uses, and valid contact details when given', () => {
  assert.deepEqual(plain(v.validateBranch(form({}), [])), {});
  assert.match(v.validateBranch(form({ name: '  ' }), []).name, /name/);
  assert.match(v.validateBranch(form({ name: ' remera ' }), ['Remera']).name, /already/);
  assert.match(v.validateBranch(form({ email: 'nope' }), []).email, /valid email/);
  assert.match(v.validateBranch(form({ phone: 'abc' }), []).phone, /phone/);
  assert.deepEqual(plain(v.validateBranch(form({ phone: '+250 788 000 000', email: 'a@b.rw' }), [])), {});
});

test('unsaved changes are noticed, ignoring surrounding spaces', () => {
  assert.equal(v.isDirty(form({}), form({})), false);
  assert.equal(v.isDirty(form({ name: ' Remera ' }), form({})), false);
  assert.equal(v.isDirty(form({ location: 'Kigali' }), form({})), true);
});

test('a plan limit is told apart from other errors so the page can offer an upgrade', () => {
  assert.equal(v.branchProblem({ status: 429, detail: 'Branch limit reached: 2 allowed on your plan' }).kind, 'limit');
  assert.equal(v.branchProblem({ detail: 'Branch limit reached' }).kind, 'limit');
  assert.equal(v.branchProblem({ status: 422, detail: "The main branch can't be deactivated." }).kind, 'other');
  assert.match(v.branchProblem(null).message, /Try again/);
});

test('period presets cover today, the last 7 days and this month', () => {
  const now = new Date(2026, 9, 29);
  assert.deepEqual(plain(v.presetRange('today', now)), { from: '2026-10-29', to: '2026-10-29' });
  assert.deepEqual(plain(v.presetRange('week', now)), { from: '2026-10-23', to: '2026-10-29' });
  assert.deepEqual(plain(v.presetRange('month', now)), { from: '2026-10-01', to: '2026-10-29' });
});

test('growth is honest when there is nothing to compare with', () => {
  assert.equal(v.growthText(null).tone, 'none');
  assert.equal(v.growthText(12.5).text, '+12.5% vs previous period');
  assert.equal(v.growthText(-3).tone, 'down');
  assert.equal(v.growthText(0).tone, 'flat');
});

test('deactivation spells out what it means for people and the main branch', () => {
  assert.equal(v.deactivationNotes({ is_main: false }, 0).length, 1);
  assert.match(v.deactivationNotes({ is_main: false }, 3)[1], /3 people are assigned/);
  assert.match(v.deactivationNotes({ is_main: false }, 1)[1], /1 person is assigned/);
  assert.match(v.deactivationNotes({ is_main: true }, 0).join(' '), /main branch/);
});

test('assigning keeps existing branches and removing the last one never grants every branch', () => {
  assert.deepEqual(plain(v.withBranch(['a'], 'b')), { branch_ids: ['a', 'b'], branch_id: 'a' });
  assert.deepEqual(plain(v.withBranch(['a'], 'a')), { branch_ids: ['a'], branch_id: 'a' });
  assert.deepEqual(plain(v.withoutBranch(['a', 'b'], 'a')), { branch_ids: ['b'], branch_id: 'b' });
  const last = plain(v.withoutBranch(['a'], 'a'));
  assert.deepEqual(last, { branch_ids: [], branch_id: null });
  assert.notEqual(last.branch_ids, null); // an empty list means "no branch", null would mean "all branches"
});
