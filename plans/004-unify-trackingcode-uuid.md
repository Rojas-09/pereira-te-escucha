# Plan 004 — Unify `buildTrackingCode` + Add UUID v4 Suffix

**Finding:** `buildTrackingCode()` exists in two files (`server-helpers.js` and `validation.js`) with identical implementation. The suffix uses `Math.random() * 9000` which only provides ~9,000 possible values, making tracking codes predictable. The PENDIENTES.md recommends UUID v4 for higher entropy.
**Category:** Architecture / Security
**Impact:** LOW — functional issue, no current exploit, but predictability is unnecessary risk
**Effort:** S (Small)
**Risk:** LOW — string format change, no DB schema change needed
**Evidence:** `backend/src/server-helpers.js:43-46`, `backend/src/validation.js:90-93`

---

## Current State

**`backend/src/server-helpers.js` (lines 43-46):**
```js
export function buildTrackingCode() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `PETE-${timestamp}-${suffix}`;
}
```

**`backend/src/validation.js` (lines 90-93):**
```js
export function buildTrackingCode() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `PETE-${timestamp}-${suffix}`;
}
```

**Problems:**
1. **Duplicate:** Same function in two files — maintainability issue
2. **Low entropy:** `Math.random()` produces ~9,000 distinct values. With 10 requests/sec, collision probability after 100 codes/day is non-trivial
3. **Predictable:** Timestamp + 4-digit number is guessable

---

## Required Changes

### 1. Remove `buildTrackingCode` from `backend/src/validation.js`

Delete lines 89-93 (the entire function):
```js
export function buildTrackingCode() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `PETE-${timestamp}-${suffix}`;
}
```

### 2. Update `backend/src/server-helpers.js` — use UUID v4 suffix

Replace the existing `buildTrackingCode` with:
```js
import crypto from 'node:crypto';

export function buildTrackingCode() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = crypto.randomUUID().split('-')[0]; // first segment of UUID v4 (8 hex chars)
  return `PETE-${timestamp}-${suffix}`;
}
```

Format: `PETE-20260407143025-a1b2c3d4`
- Timestamp: 14 chars (YYYYMMDDHHmmss) — human readable, sortable
- UUID segment: 8 hex chars — 4,294,967,296 possible values vs 9,000

### 3. Fix imports in `backend/src/validation.js`

If any code in `validation.js` imported `buildTrackingCode` from itself, it now needs to import from `server-helpers.js`. Check:

```bash
grep -rn "buildTrackingCode" backend/src/
```

If `validation.js` is called from `app.js` that imports `buildTrackingCode` from `validation.js`, update that import to point to `server-helpers.js`.

### 4. Note for Plan 005 (split server.js into modules)

When Plan 005 executes and creates `services/request.service.js`, it should:
1. Move `buildTrackingCode` from `server-helpers.js` to `services/request.service.js`
2. Keep the UUID v4 suffix implementation
3. Delete `server-helpers.js` (already in Plan 005 scope)

---

## Verification Gates

```bash
# 1. Verify no duplicate function
grep -c "export function buildTrackingCode" backend/src/server-helpers.js
# Expected: 1

grep -c "export function buildTrackingCode" backend/src/validation.js
# Expected: 0 (removed from validation.js)

# 2. Verify UUID v4 format
node -e "
  import { buildTrackingCode } from './src/server-helpers.js';
  const code = buildTrackingCode();
  const match = /^PETE-\d{14}-[0-9a-f]{8}$/;
  console.log(match.test(code) ? 'PASS: ' + code : 'FAIL: ' + code);
"

# 3. Verify uniqueness
node -e "
  import { buildTrackingCode } from './src/server-helpers.js';
  const codes = new Set();
  for (let i = 0; i < 10000; i++) codes.add(buildTrackingCode());
  console.log(codes.size === 10000 ? 'PASS: 10000 unique codes' : 'FAIL: ' + codes.size + ' unique');
"

# 4. Run tests
cd backend && npm test
# Expected: all tests pass

# 5. Verify no remaining references to old format
grep -rn "Math.random.*9000" backend/src/
# Expected: no matches
```

---

## Files in Scope
- `backend/src/validation.js` — remove `buildTrackingCode` function
- `backend/src/server-helpers.js` — update `buildTrackingCode` to use UUID v4

## Files Explicitly Out of Scope
- `backend/src/app.js`
- `backend/src/config.js`
- `backend/src/constants.js`
- DB schema / migrations (column `client_tracking_code` is VARCHAR, no size limit concern)

---

## Conventions to Follow
- Use `crypto.randomUUID()` (Node.js built-in, no dependency)
- Keep timestamp prefix for human readability
- Format: `PETE-{timestamp}-{uuid_segment}`
- Existing tracking codes in DB remain valid (no migration needed)

---

## Test Plan
1. `npm test` — all existing tests pass
2. Manual: generate 10,000 codes, verify all unique
3. Verify regex format: `/^PETE-\d{14}-[0-9a-f]{8}$/`

---

## STOP Conditions
- If `crypto.randomUUID()` is not available (Node < 19), use `crypto.randomUUID()` from `node:crypto` directly
- If any test fails, STOP and report
- If `buildTrackingCode` is exported from `validation.js` and consumed somewhere unexpected (check `grep -rn "from.*validation.*buildTrackingCode"`), STOP and update imports
