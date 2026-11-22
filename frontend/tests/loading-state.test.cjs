const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file) {
  const source = fs.readFileSync(path.join(__dirname, '../src/', file), 'utf8');
  const api = {};
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, {exports: api, TypeError});
  return api;
}
const errors = load('lib/api/errors.ts');
const state = load('lib/loadState.ts');
const scope = load('lib/api/branchScope.ts');

test('a failed request is an error, never "empty" or zero', () => {
  assert.equal(state.loadState({isError: true, isPending: true, isFetching: false}), 'error');
  assert.equal(state.loadState({isPending: true, isFetching: true}), 'loading');
  assert.equal(state.loadState({data: {items: []}, isPending: false}), 'empty');
  assert.equal(state.loadState({data: {items: [1]}, isPending: false}), 'ready');
  assert.equal(state.loadState({data: {total_revenue: 0}, isPending: false}), 'ready');  // a real zero is data, not "empty"
});

test('data already on screen is kept when a background refresh fails', () => {
  assert.equal(state.loadState({data: {items: [1]}, isError: true, isFetching: false}), 'ready');
  assert.equal(state.isRefreshing({data: [1], isFetching: true}), true);
  assert.equal(state.isRefreshing({data: undefined, isFetching: true}), false);  // first load is "loading", not "refreshing"
});

test('a switched-off query is idle, not loading forever', () => {
  assert.equal(state.loadState({isPending: true, isFetching: false}), 'idle');
});

test('a section needing several queries reports the worst state', () => {
  assert.equal(state.combinedState(['ready', 'error', 'loading']), 'error');
  assert.equal(state.combinedState(['ready', 'loading']), 'loading');
  assert.equal(state.combinedState(['ready', 'empty']), 'ready');
  assert.equal(state.combinedState(['empty', 'empty']), 'empty');
});

test('one-click actions show progress only on the row being acted on', () => {
  assert.equal(state.isPendingFor({isPending: true, variables: 'a'}, 'a'), true);
  assert.equal(state.isPendingFor({isPending: true, variables: 'a'}, 'b'), false);
  assert.equal(state.isPendingFor({isPending: true, variables: {id: 'b', data: {}}}, 'b'), true);
  assert.equal(state.isPendingFor({isPending: false, variables: 'a'}, 'a'), false);
});

test('network failures and timeouts become readable errors with the usual shape', () => {
  assert.deepEqual({...errors.toApiError(new TypeError('Failed to fetch'))}, {status: 0, detail: errors.NETWORK_MESSAGE, kind: 'network'});
  assert.equal(errors.toApiError(new Error('x'), true).kind, 'timeout');
  assert.equal(errors.toApiError({name: 'AbortError'}).detail, errors.TIMEOUT_MESSAGE);
  assert.deepEqual({...errors.toApiError({status: 409, detail: 'Already approved'})}, {status: 409, detail: 'Already approved', kind: 'http'});
  assert.equal(errors.apiErrorMessage({status: 422, detail: 'Name is required'}), 'Name is required');
  assert.equal(errors.apiErrorMessage(undefined, 'fallback'), 'fallback');
  assert.equal(errors.apiErrorMessage(new Error('Readable')), 'Readable');
});

test('only reads that could succeed on a second try are retried', () => {
  assert.equal(errors.isRetryableError(new TypeError('Failed to fetch')), true);
  assert.equal(errors.isRetryableError({status: 503, detail: 'down'}), true);
  assert.equal(errors.isRetryableError({status: 429, detail: 'slow down'}), true);
  for (const status of [400, 401, 403, 404, 409, 422]) assert.equal(errors.isRetryableError({status, detail: 'no'}), false);
});

test('long operations get timeouts that match the server', () => {
  assert.ok(errors.AI_TIMEOUT_MS >= 180_000);  // up to 6 model calls of 30s each on the server
  assert.ok(errors.FILE_TIMEOUT_MS > errors.REQUEST_TIMEOUT_MS);
});

test('a branch switch resets branch data, refreshes entitlements and keeps the person', () => {
  assert.equal(scope.branchSwitchAction(['users', 'me']), 'keep');
  assert.equal(scope.branchSwitchAction(['tenants', 'me', 'current']), 'keep');
  assert.equal(scope.branchSwitchAction(['tenants', 'me', 'entitlements']), 'refresh');
  assert.equal(scope.branchSwitchAction(['tenants', 'me', 'modules']), 'refresh');
  for (const key of [['orders', 1, 25], ['users', 1], ['reports', 'daily'], ['inventory', 'products', 1], ['users', 'me', 'extra']]) {
    assert.equal(scope.branchSwitchAction(key), 'reset', JSON.stringify(key));
  }
});
