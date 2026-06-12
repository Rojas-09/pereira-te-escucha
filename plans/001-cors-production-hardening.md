# Plan 001 — CORS Production Hardening

**Finding:** `ALLOWED_ORIGIN=*` in `backend/.env.example` is copied to production without change, leaving CORS fully open.
**Category:** Security / Config
**Impact:** HIGH — any origin can call `/api/pqrs/*` endpoints
**Effort:** S (Small)
**Risk:** LOW — config change only
**Evidence:** `backend/.env.example:2`, `backend/src/config.js:15`, `backend/src/app.js:45`

---

## Current State

**`backend/.env.example` (line 2):**
```env
ALLOWED_ORIGIN=*
```

**`backend/src/config.js` (lines 13-18):**
```js
export const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
// ...
if (NODE_ENV === 'production') {
  if (!BACKEND_API_TOKEN) {
    throw new Error('BACKEND_API_TOKEN es obligatorio en produccion...');
  }
  // ALLOWED_ORIGIN is NOT validated in production!
}
```

**`backend/src/app.js` (lines 42-50):**
```js
const corsOptions = {
  origin: ALLOWED_ORIGIN, // <-- uses config value directly
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-token'],
  credentials: true
};
app.use(cors(corsOptions));
```

---

## Required Changes

### 1. Update `backend/.env.example`
Change line 2 from `ALLOWED_ORIGIN=*` to:
```env
ALLOWED_ORIGIN=https://tudominio.com
```

### 2. Update `backend/src/config.js`
Add production validation for `ALLOWED_ORIGIN` (after line 20, inside the production block):
```js
if (NODE_ENV === 'production') {
  if (!BACKEND_API_TOKEN) {
    throw new Error('BACKEND_API_TOKEN es obligatorio en produccion...');
  }
  if (!process.env.DB_PASSWORD) {
    throw new Error('DB_PASSWORD es obligatorio en produccion...');
  }
  // NEW: Validate CORS origin in production
  if (!ALLOWED_ORIGIN || ALLOWED_ORIGIN === '*') {
    throw new Error('ALLOWED_ORIGIN debe ser un origen específico (no *) en producción. Define la variable en .env antes de iniciar.');
  }
}
```

### 3. Update `backend/README.md`
Add warning in "Variables de entorno" section:
> **⚠️ PRODUCCIÓN:** `ALLOWED_ORIGIN` **debe** ser un origen específico (ej. `https://pereira-te-escucha.com`). El valor `*` solo está permitido en desarrollo local.

---

## Verification Gates

Run these commands in order. All must pass.

```bash
# 1. Check .env.example has been updated
grep '^ALLOWED_ORIGIN=' backend/.env.example
# Expected: ALLOWED_ORIGIN=https://tudominio.com

# 2. Check config.js has production validation
grep -A5 "ALLOWED_ORIGIN.*producción" backend/src/config.js
# Should show the new validation block

# 3. Type-check (if TypeScript config exists)
cd backend && npm run typecheck 2>/dev/null || echo "No typecheck script"

# 4. Run existing tests
cd backend && npm test
# Expected: all tests pass

# 5. Simulate production startup (should fail with *)
cd backend && NODE_ENV=production ALLOWED_ORIGIN=* BACKEND_API_TOKEN=test DB_PASSWORD=test node -e "import('./src/config.js')" 2>&1
# Expected: Error "ALLOWED_ORIGIN debe ser un origen específico"

# 6. Simulate production startup (should succeed with valid origin)
cd backend && NODE_ENV=production ALLOWED_ORIGIN=https://api.example.com BACKEND_API_TOKEN=test DB_PASSWORD=test node -e "import('./src/config.js')" 2>&1
# Expected: No error (module loads successfully)
```

---

## Files in Scope
- `backend/.env.example`
- `backend/src/config.js`
- `backend/README.md`

## Files Explicitly Out of Scope
- `backend/src/app.js` (no changes needed)
- `backend/.env` (local file, not committed)
- Any frontend files

---

## Conventions to Follow
- Error messages in Spanish, matching existing style in `config.js`
- Throw `Error` with descriptive message (same pattern as `BACKEND_API_TOKEN`)
- Keep validation inside the existing `if (NODE_ENV === 'production')` block

---

## Test Plan
No new tests required — this is a config validation change. Existing tests should pass.

---

## Maintenance Note
When deploying to a new domain, update `ALLOWED_ORIGIN` in production `.env` before starting. The validation will catch missing/incorrect values at startup.

---

## STOP Conditions
- If `backend/.env.example` has other `*` defaults that should be hardened, STOP and report — do not add more validations in this plan.
- If `config.js` structure differs significantly from what's shown above, STOP and report.
- If tests fail after changes, STOP and report — do not modify tests.

---

## Git Commit Stamp
Run before executing: `git rev-parse --short HEAD`
Record the commit hash in the plan execution log.