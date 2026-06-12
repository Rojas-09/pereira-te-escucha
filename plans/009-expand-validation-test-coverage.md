# Plan 009 — Expand validation.test.js Coverage

**Finding:** The existing `validation.test.js` has 6 tests covering basic sanitization, body validation, and file validation. Missing cases: max file size boundary, max file count exact limit, empty/missing description, asunto length boundary, email format edge cases, and error contract testing.
**Category:** Test Coverage
**Impact:** MEDIUM — incomplete test coverage means regressions can slip through
**Effort:** S (Small)
**Risk:** LOW — additive tests only
**Evidence:** `backend/src/validation.test.js`

---

## Current State

**Existing tests (6 total):**
1. `sanitizeText removes dangerous html/js payloads`
2. `validateBody returns ok for a valid correo_electronico payload`
3. `validateBody rejects correo_electronico without correo`
4. `validateBody rejects aceptarTratamiento present but not true`
5. `validateBody rejects aceptarTratamiento absent`
6. `validateFiles rejects path traversal and invalid mime type`
7. `validateFiles rejects more than MAX_FILES` (note: 7 total)
8. `validateFiles rejects files exceeding MAX_FILE_SIZE_BYTES`

**Missing coverage:**
| Scenario | Why Important |
|----------|---------------|
| Empty body → validateBody should fail | Catches missing payload handling |
| `asunto` with < 5 chars (boundary) | Schema says min(5) |
| `asunto` with > 255 chars (boundary) | Schema says max(255) |
| `correo` with invalid email format | Schema says .email() |
| `descripcion` empty string | Schema says min(1) |
| validateFiles with empty array | Edge case — should pass |
| validateFiles with null/undefined | Edge case — should fail gracefully |
| validateFiles with MAX_FILES exactly | Boundary — should pass |
| validateFiles with MAX_FILE_SIZE_BYTES exactly | Boundary — should pass |
| validateFiles with file missing originalname | Edge case — null handling |
| sanitizeText with empty string | Edge case |
| sanitizeText with only whitespace | Edge case |
| **Error contract**: all validation errors have shape `{ path, message }` | Depends on by frontend/API consumers |

---

## Required Changes

### Add to `backend/src/validation.test.js`

Add these tests after the existing ones:

```js
// ── Edge cases: empty/missing body ──

test('validateBody returns errors for empty input', () => {
  const result = validateBody({});
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0, 'Should have validation errors for empty body');
  assert.ok(result.errors.every(e => 'path' in e && 'message' in e), 'Each error must have path and message');
});

// ── Asunto boundary tests ──

test('validateBody rejects asunto with less than 5 characters', () => {
  const result = validateBody({
    medioRespuesta: 'cartelera',
    tipoSolicitud: 'peticion',
    asunto: 'abcd',
    descripcion: 'Descripcion con longitud suficiente para pasar el minimo.',
    aceptarTratamiento: true,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.path === 'asunto'));
});

test('validateBody accepts asunto with exactly 5 characters', () => {
  const result = validateBody({
    medioRespuesta: 'cartelera',
    tipoSolicitud: 'peticion',
    asunto: 'abcde',
    descripcion: 'Descripcion con longitud suficiente para pasar el minimo.',
    aceptarTratamiento: true,
  });

  assert.equal(result.ok, true);
});

test('validateBody rejects asunto with more than 255 characters', () => {
  const longAsunto = 'a'.repeat(256);
  const result = validateBody({
    medioRespuesta: 'cartelera',
    tipoSolicitud: 'peticion',
    asunto: longAsunto,
    descripcion: 'Descripcion con longitud suficiente para pasar el minimo.',
    aceptarTratamiento: true,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.path === 'asunto'));
});

test('validateBody accepts asunto with exactly 255 characters', () => {
  const exactAsunto = 'a'.repeat(255);
  const result = validateBody({
    medioRespuesta: 'cartelera',
    tipoSolicitud: 'peticion',
    asunto: exactAsunto,
    descripcion: 'Descripcion con longitud suficiente para pasar el minimo.',
    aceptarTratamiento: true,
  });

  assert.equal(result.ok, true);
});

// ── Descripcion boundary ──

test('validateBody rejects empty descripcion', () => {
  const result = validateBody({
    medioRespuesta: 'cartelera',
    tipoSolicitud: 'peticion',
    asunto: 'Asunto valido para prueba',
    descripcion: '',
    aceptarTratamiento: true,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.path === 'descripcion'));
});

// ── Email validation ──

test('validateBody rejects invalid email format when provided', () => {
  const result = validateBody({
    medioRespuesta: 'correo_electronico',
    correo: 'not-an-email',
    tipoSolicitud: 'peticion',
    asunto: 'Asunto valido para prueba',
    descripcion: 'Descripcion con contenido valido para superar el minimo.',
    aceptarTratamiento: true,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.path === 'correo'));
});

// ── Files edge cases ──

test('validateFiles returns ok for empty files array', () => {
  const result = validateFiles([]);
  assert.equal(result.ok, true);
});

test('validateFiles returns ok for exactly MAX_FILES files', () => {
  const files = [];
  for (let i = 0; i < MAX_FILES; i++) {
    files.push({
      originalname: `archivo${i}.pdf`,
      mimetype: 'application/pdf',
      size: 1000,
    });
  }

  const result = validateFiles(files);
  assert.equal(result.ok, true);
});

test('validateFiles accepts file exactly at MAX_FILE_SIZE_BYTES', () => {
  const files = [{
    originalname: 'exact_size.pdf',
    mimetype: 'application/pdf',
    size: MAX_FILE_SIZE_BYTES,
  }];

  const result = validateFiles(files);
  assert.equal(result.ok, true);
});

test('validateFiles handles null input gracefully', () => {
  const result = validateFiles(null);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].path, 'files');
});

test('validateFiles handles undefined input gracefully', () => {
  const result = validateFiles(undefined);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].path, 'files');
});

test('validateFiles handles file with no originalname', () => {
  const result = validateFiles([{
    mimetype: 'application/pdf',
    size: 1000,
  }]);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.path === 'files.0'));
});

// ── Sanitize edge cases ──

test('sanitizeText returns empty string for non-string input', () => {
  assert.equal(sanitizeText(undefined), '');
  assert.equal(sanitizeText(null), '');
  assert.equal(sanitizeText(123), '');
  assert.equal(sanitizeText({}), '');
});

test('sanitizeText handles empty string', () => {
  assert.equal(sanitizeText(''), '');
});

test('sanitizeText handles whitespace-only string', () => {
  assert.equal(sanitizeText('   '), '');
});

// ── Error contract: all errors must have path and message ──

test('all validation errors have path and message shape', () => {
  const result = validateBody({});
  assert.equal(result.ok, false);
  for (const error of result.errors) {
    assert.ok(typeof error.path === 'string', `error.path must be string, got ${typeof error.path}`);
    assert.ok(typeof error.message === 'string', `error.message must be string, got ${typeof error.message}`);
    assert.ok(error.path.length > 0, 'error.path must not be empty');
    assert.ok(error.message.length > 0, 'error.message must not be empty');
  }
});
```

---

## Verification Gates

```bash
# 1. Run all tests
cd backend && npm test
# Expected: ALL tests pass (old 8 + new ~24 = ~32 total)

# 2. Count test assertions
cd backend && node --test src/validation.test.js 2>&1 | tail -5
# Expected: shows all tests passing, no failures

# 3. Verify error contract explicitly
node -e "
  import { validateBody } from './src/validation.js';
  const result = validateBody({ medioRespuesta: 'invalid' });
  const allHaveShape = result.errors.every(e =>
    typeof e.path === 'string' && e.path.length > 0 &&
    typeof e.message === 'string' && e.message.length > 0
  );
  console.log(allHaveShape ? 'PASS: All errors have correct shape' : 'FAIL');
"
```

---

## Files in Scope
- `backend/src/validation.test.js` — add all new tests

## Files Explicitly Out of Scope
- `backend/src/validation.js` (no code changes needed)
- `backend/src/constants.js` (no changes)
- `backend/src/app.js` (no changes)

---

## Conventions to Follow
- Use `node:test` + `node:assert/strict` (matching existing style)
- Keep alphabetical/grouped organization within the file
- Use descriptive test names in Spanish following existing pattern
- Each test is independent — no shared state

---

## Test Plan
This plan IS the test plan. Run `npm test` — it must pass.

---

## STOP Conditions
- If any existing test breaks, STOP and report — the existing tests are correct and should not need modification
- If the test count doesn't increase by at least 20 new tests, STOP and report
