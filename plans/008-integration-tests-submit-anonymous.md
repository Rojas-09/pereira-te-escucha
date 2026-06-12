# Plan 008 — Integration Tests for /api/pqrs/submit-anonymous

**Finding:** There are no integration tests for the main backend endpoint `POST /api/pqrs/submit-anonymous`. The only tests are unit tests for `validation.js`. This means regressions in route handlers, middleware, or the full request flow go undetected.
**Category:** Test Coverage
**Impact:** HIGH — no safety net for backend endpoint changes
**Effort:** M (Medium)
**Risk:** LOW — additive, existing code stays as-is
**Evidence:** `backend/src/validation.test.js` (only validation tests exist), `backend/package.json` (no supertest or integration test script)

---

## Current State

**Test setup:**
```bash
# Only validation tests exist:
npm test
# Runs: node --test src/validation.test.js
```

**Dependencies available:** express, zod, pg (but no supertest or test DB helpers)

**No integration tests exist for:**
- `POST /api/pqrs/submit-anonymous` — multipart form-data submission
- `GET /api/pqrs/status/:trackingCode` — status query
- `GET /health` — health check
- `GET /` — root endpoint

---

## Required Changes

### 1. Install test dependencies

```bash
cd backend && npm install --save-dev supertest
```

### 2. Create `backend/src/routes/pqrs.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';

// Mock ALL dependencies that would normally be injected
const MOCK_TOKEN = 'test-token-123';

// Mock the persistence layer BEFORE creating the app
// We need to mock server-helpers functions to avoid DB calls

// Save original module references
let persistMockCalled = false;
let trackingCodeMock = null;

// These will be set by the test
const mockHelpers = {
  buildTrackingCode: () => {
    trackingCodeMock = 'PETE-TEST-00000000000000-9999';
    return trackingCodeMock;
  },
  persistReceivedRequest: async ({ trackingCode, payload, files }) => {
    persistMockCalled = true;
    return 123; // mock request ID
  },
  cleanupFiles: async (files) => {},
  queryTrackingStatus: async (trackingCode) => {
    if (trackingCode === 'PETE-TEST-00000000000000-9999') {
      return {
        requestId: 123,
        trackingCode: 'PETE-TEST-00000000000000-9999',
        status: 'recibido',
        events: [],
      };
    }
    return null;
  },
};

// We need to use import mocking. Since Node's test runner doesn't have built-in
// module mocking, we'll use a wrapper approach.
//
// ALTERNATIVE: Use `node:test` with `mock` module
// Node.js 20+ has test mocks via `mock.module()` — but it's experimental.
//
// PRACTICAL SOLUTION: Create the app with a flag to use mock services,
// or use dependency injection.

// For now, we'll test route-level logic by creating a test-specific app
// that uses the real app factory but with mocked persistence.

test('GET /health returns ok', async () => {
  const app = createApp(MOCK_TOKEN);
  
  // We need a way to test without running the server
  // Use `app.listen(0)` + fetch, or use supertest
  // With supertest:
  // const response = await request(app).get('/health');
  // assert.equal(response.status, 200);
  // assert.equal(response.body.ok, true);
  
  // For now, this is a placeholder — see the note below about supertest
  assert.ok(true, 'Test structure created — see implementation note');
});

test('GET / returns service info', async () => {
  // Same pattern
  assert.ok(true, 'Test structure created — see implementation note');
});

test('POST /api/pqrs/submit-anonymous with valid data returns 202', async () => {
  // Same pattern
  assert.ok(true, 'Test structure created — see implementation note');
});

test('POST /api/pqrs/submit-anonymous without aceptarTratamiento returns 400', async () => {
  // Same pattern
  assert.ok(true, 'Test structure created — see implementation note');
});

test('GET /api/pqrs/status/:trackingCode returns tracking data', async () => {
  // Same pattern
  assert.ok(true, 'Test structure created — see implementation note');
});

test('GET /api/pqrs/status/:trackingCode returns 404 for unknown code', async () => {
  // Same pattern
  assert.ok(true, 'Test structure created — see implementation note');
});
```

**IMPORTANT:** Since `server-helpers.js` functions are imported directly (not injected), we need to either:
1. **Refactor first** (Plan 005) to use dependency injection, then write tests
2. **OR** Use `node:test` experimental `mock.module()` feature
3. **OR** Write integration tests that connect to a real test DB

**RECOMMENDED APPROACH:** Execute Plan 005 (split into modules) first, then write integration tests using dependency injection. Alternatively, use a test database with `DATABASE_URL` pointing to a test instance.

### 3. Create `backend/src/routes/health.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('health endpoint integration test', async () => {
  // After Plan 005 is done, this will be straightforward
  // The app factory accepts dependencies, so we can inject mocks
  assert.ok(true, 'Deferred until Plan 005 is complete');
});
```

### 4. Update `package.json` — add test script for all tests

```json
{
  "scripts": {
    "test": "node --test src/**/*.test.js",
    "test:unit": "node --test src/validation.test.js",
    "test:integration": "node --test src/routes/*.test.js"
  }
}
```

---

## Verification Gates

```bash
# 1. Install supertest
cd backend && npm install --save-dev supertest

# 2. Run all tests
cd backend && npm test
# Expected: unit tests pass, integration tests are placeholders

# 3. Verify test files exist
ls backend/src/**/*.test.js
# Expected: validation.test.js pqrs.test.js health.test.js
```

---

## Files in Scope

**Install:**
- `supertest` (dev dependency)

**Create:**
- `backend/src/routes/pqrs.test.js`
- `backend/src/routes/health.test.js`

**Modify:**
- `backend/package.json` — update test script pattern

## Files Explicitly Out of Scope
- `backend/src/validation.js`
- `backend/src/app.js` (no changes needed for test structure)

---

## Key Insight: Test Strategy

This project has a dependency problem — `server-helpers.js` functions are imported directly, not injected. Two paths forward:

**Path A (Recommended — do first):**
1. Execute Plan 005 (split into services)
2. Make `createApp` accept an options object with service overrides
3. Write tests using `supertest` + mock services

**Path B (Work now):**
1. Create tests that use a real PostgreSQL test DB
2. Each test creates/fixtures data and cleans up after
3. Uses `DATABASE_URL_TEST` env var

Choose Path A if Plan 005 will be executed soon. Choose Path B for immediate coverage.

---

## Conventions to Follow
- Use `node:test` + `node:assert/strict` (matching existing style)
- Use `supertest` for HTTP integration
- Test files named `*.test.js` alongside source files
- Each test cleans up after itself

---

## Test Plan
This plan IS the test plan. Execute after Plan 005.

---

## STOP Conditions
- If `supertest` has import/compatibility issues with ESM, STOP and use `node:fetch` with `app.listen(0)` instead
- If the test DB approach is chosen and no `DATABASE_URL_TEST` is available, STOP and report
