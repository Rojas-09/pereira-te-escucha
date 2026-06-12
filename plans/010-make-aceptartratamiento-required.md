# Plan 010 — Make aceptarTratamiento Required in Zod Schema

**Finding:** The Zod schema in `validation.js` defines `aceptarTratamiento` with a refine that checks it's `true`, but allows it to be absent or falsy via `.boolean().or(z.literal('true'))` — the coercion pattern can hide missing consent. The test `'validateBody rejects aceptarTratamiento absent'` already expects this to fail, but the refine error message is not explicit enough.
**Category:** Validation / Correctness
**Impact:** MEDIUM — consent could be bypassed if schema is updated incorrectly
**Effort:** S (Small)
**Risk:** LOW — explicit change, well-tested
**Evidence:** `backend/src/validation.js:12-14` (Zod schema)

---

## Current State

**`backend/src/validation.js` lines 12-14:**
```js
  aceptarTratamiento: z.boolean().or(z.literal('true')).refine(v => v === true || v === 'true', {
    message: 'aceptarTratamiento debe ser true'
  }),
```

The `refine` checks the value, but the type union `z.boolean().or(z.literal('true'))` means Zod will coerce `undefined` to `undefined` which fails the `.boolean()` check first with a generic type error, not the refine message. When `aceptarTratamiento` is missing entirely, Zod throws a type error before reaching the refine.

**Also in `App.tsx` (line ~452):**
```tsx
formData.append('aceptarTratamiento', 'true');
```
This is hardcoded as `'true'` string, which passes the `z.literal('true')` check. This is fine for the app, but the model should still enforce it on the backend.

---

## Required Changes

### 1. Update `backend/src/validation.js` — make aceptarTratamiento strictly required

Replace the existing field with:
```js
  aceptarTratamiento: z.literal(true, {
    errorMap: () => ({ message: 'aceptarTratamiento debe ser explícitamente true. Debes aceptar el tratamiento de datos personales.' })
  }),
```

This makes it:
- **Required** — Zod will reject if the field is missing
- **Must be exactly `true`** — any falsy value (false, undefined, null, 'false') will fail
- **Custom error message** — clear and descriptive in Spanish

### 2. Update tests in `backend/src/validation.test.js`

The existing test `'validateBody rejects aceptarTratamiento present but not true'` should still pass. The test `'validateBody rejects aceptarTratamiento absent'` should also still pass.

Add a new test for clarity:
```js
test('validateBody rejects aceptarTratamiento with explicit false', () => {
  const result = validateBody({
    medioRespuesta: 'cartelera',
    tipoSolicitud: 'peticion',
    asunto: 'Asunto valido para prueba',
    descripcion: 'Descripcion con longitud minima superada.',
    aceptarTratamiento: false
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors[0].message.includes('true'));
});
```

### 3. Update `App.tsx` (optional — currently sends `'true'` string)

The app currently sends `formData.append('aceptarTratamiento', 'true')` which is a string `'true'`. With the new schema using `z.literal(true)`, this will fail because `'true'` (string) !== `true` (boolean).

Fix: Change line in `App.tsx` from:
```tsx
formData.append('aceptarTratamiento', 'true');
```
to:
```tsx
formData.append('aceptarTratamiento', 'true'); // Keep as string for FormData
```

Wait — FormData always sends strings, so `z.literal(true)` will fail for FormData submissions! The backend receives form fields as strings from `multipart/form-data`.

**CORRECTION:** Use a preprocess to coerce the string:
```js
  aceptarTratamiento: z.preprocess(
    (val) => {
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return val;
    },
    z.literal(true, {
      errorMap: () => ({ message: 'aceptarTratamiento debe ser explícitamente true. Debes aceptar el tratamiento de datos personales.' })
    })
  ),
```

This handles both string `'true'` (from FormData/multipart) and boolean `true` (from JSON body).

---

## Verification Gates

```bash
# 1. Run validation tests
cd backend && npm test
# Expected: all tests pass (including the 2 aceptarTratamiento tests)

# 2. Test with boolean true (JSON body)
node -e "
  import { validateBody } from './src/validation.js';
  const r = validateBody({
    medioRespuesta: 'cartelera',
    tipoSolicitud: 'peticion',
    asunto: 'Asunto valido largo prueba diez',
    descripcion: 'Descripcion con contenido valido para superar el minimo.',
    aceptarTratamiento: true
  });
  console.log('Boolean true:', r.ok ? 'PASS' : 'FAIL');
"

# 3. Test with string 'true' (FormData body — multipart sends strings)
node -e "
  import { validateBody } from './src/validation.js';
  const r = validateBody({
    medioRespuesta: 'cartelera',
    tipoSolicitud: 'peticion',
    asunto: 'Asunto valido largo prueba diez',
    descripcion: 'Descripcion con contenido valido.',
    aceptarTratamiento: 'true'
  });
  console.log('String true:', r.ok ? 'PASS' : 'FAIL');
"

# 4. Test with absent field
node -e "
  import { validateBody } from './src/validation.js';
  const r = validateBody({
    medioRespuesta: 'cartelera',
    tipoSolicitud: 'peticion',
    asunto: 'Asunto valido largo prueba diez',
    descripcion: 'Descripcion con contenido valido.'
  });
  console.log('Absent:', !r.ok ? 'PASS (rejected)' : 'FAIL');
"

# 5. Test with false
node -e "
  import { validateBody } from './src/validation.js';
  const r = validateBody({
    medioRespuesta: 'cartelera',
    tipoSolicitud: 'peticion',
    asunto: 'Asunto valido largo prueba diez',
    descripcion: 'Descripcion con contenido valido.',
    aceptarTratamiento: false
  });
  console.log('False:', !r.ok ? 'PASS (rejected)' : 'FAIL');
"
```

---

## Files in Scope
- `backend/src/validation.js`
- `backend/src/validation.test.js` (optional: add explicit false test)

## Files Explicitly Out of Scope
- `App.tsx` (already sends `'true'` string which works with the preprocess)
- `backend/src/app.js`
- `backend/src/config.js`

---

## Conventions to Follow
- Error messages in Spanish
- Use `z.preprocess` for coercion before `z.literal` validation
- Match existing error format in validation responses
- `errorMap` returns object with `message` key

---

## Test Plan
Run `npm test` — all 6 existing tests + the new explicit false test must pass.

---

## STOP Conditions
- If FormData submissions fail after change (check the backend actually receives `aceptarTratamiento` as string `'true'`), STOP and report
- If any existing test fails, STOP and report
