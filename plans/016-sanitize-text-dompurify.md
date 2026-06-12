# Plan 016 — Improve `sanitizeText` with DOMPurify / Whitelist Approach

**Finding:** `sanitizeText` in `validation.js` uses a blacklist regex approach (removes `<`, `>`, `javascript:`, `on\w+=`, `data:`) which is a "defensa parcial" per the AUDIT. A blacklist is inherently incomplete — new attack vectors or encoding bypasses can slip through. A whitelist-based sanitizer (DOMPurify) or a more robust allowlist of safe characters is recommended.
**Category:** Security
**Impact:** MEDIUM — partial XSS defense, could be bypassed with encoded payloads
**Effort:** S (Small)
**Risk:** LOW — sanitizeText is applied after Zod validation, not before; changing to DOMPurify only makes it stricter
**Evidence:** `backend/src/validation.js:7-14`, `docs/AUDIT.md` (Vulnerabilidades y riesgos → Media)

---

## Current State

**`backend/src/validation.js` (lines 7-14):**
```js
export function sanitizeText(input) {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/[<>]/g, '')           // Elimina < y > para prevenir HTML injection
    .replace(/javascript:/gi, '')   // Elimina javascript: URIs
    .replace(/on\w+\s*=/gi, '')     // Elimina event handlers como onclick=
    .replace(/data:/gi, '')         // Elimina data: URIs potencialmente peligrosos
    .trim();
}
```

**Problems:**
1. **Blacklist is incomplete:** Bypasses exist (e.g., `\njavascript:`, `&#106;avascript:`, `<svg onload=alert(1)>` with encoded variants)
2. **Only removes, doesn't encode:** The original text is altered, potentially breaking legitimate content that includes these patterns
3. **No context awareness:** Same sanitization for both `asunto` (short text) and `descripcion` (long text) — different XSS risks
4. **No DOMPurify:** The gold standard for HTML sanitization is not used

---

## Required Changes

### Option A: Whitelist character approach (simpler, no dependency)

Replace `sanitizeText` with a whitelist of safe characters. This is the most secure approach for text that should NOT contain HTML:

```js
export function sanitizeText(input) {
  if (typeof input !== 'string') return '';

  return input
    .replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ,.;:!¿?()\-@/]/g, '') // solo caracteres seguros
    .replace(/\s{3,}/g, '  ') // normalize multiple spaces
    .trim();
}
```

This whitelist allows:
- Alphanumeric: `a-z`, `A-Z`, `0-9`, `_`
- Spanish chars: accented vowels, `ñ`, `ü`
- Punctuation: `,.;:!¿?()-@/`
- Whitespace

And blocks **everything else** including `<`, `>`, `"`, `'`, `` ` ``, `$`, `%`, `&`, `#`, `*`, `+`, `=`, `[`, `]`, `{`, `}`, `|`, `\`, `^`, `~`

**Pros:** No dependency, simple, predictable
**Cons:** Blocks legitimate characters like `#` (might be needed in addresses), `&` (in names), `"` (quotes in descriptions)

### Option B: DOMPurify (server-side, recommended)

Install and use DOMPurify for server-side sanitization. DOMPurify is a battle-tested XSS sanitizer used by many frameworks.

```bash
cd backend && npm install dompurify jsdom
```

```js
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

const window = new JSDOM('').window;
const purify = DOMPurify(window);

export function sanitizeText(input) {
  if (typeof input !== 'string') return '';
  
  // DOMPurify removes all HTML tags and dangerous content
  // ALLOWED_TAGS: [] means strip everything — only plain text remains
  return purify.sanitize(input, {
    ALLOWED_TAGS: [],      // no HTML tags allowed
    ALLOWED_ATTR: [],      // no attributes allowed
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  }).trim();
}
```

**Pros:** Industry standard, handles all known XSS vectors, actively maintained
**Cons:** Adds two dependencies (dompurify + jsdom), ~2MB added to node_modules

### Option C: Combined approach (recommended for this project)

Use DOMPurify as the primary defense PLUS a character whitelist as defense-in-depth:

```js
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

const window = new JSDOM('').window;
const purify = DOMPurify(window);

export function sanitizeText(input) {
  if (typeof input !== 'string') return '';

  // Step 1: DOMPurify strips all HTML/XSS
  const purified = purify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });

  // Step 2: Whitelist remaining characters (defense-in-depth)
  return purified
    .replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ,.;:!¿?()\-@/#&'"\n]/g, '')
    .replace(/\n{4,}/g, '\n\n\n') // cap consecutive newlines
    .trim();
}
```

---

## Recommendation

**Use Option A (whitelist)** for this project because:

1. The app only handles plain text descriptions and subjects — no rich text or HTML input
2. Zero new dependencies
3. Faster at runtime (no JSDOM/DOMPurify overhead)
4. The whitelist covers all characters a citizen would use in a PQRS description
5. Simpler to audit and maintain

If rich text is needed in the future, upgrade to DOMPurify then.

---

## Required Changes

### 1. Update `backend/src/validation.js`

Replace the existing `sanitizeText` function:

```js
export function sanitizeText(input) {
  if (typeof input !== 'string') return '';

  // Whitelist-based sanitization: only safe characters pass through
  // This is defense-in-depth — Zod already validates types and lengths
  return input
    .replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ,.;:!¿?()\-@/#&'"\n]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/\s{3,}/g, '  ')
    .trim();
}
```

### 2. Update `backend/src/validation.test.js`

Update existing sanitizeText tests and add new ones:

```js
test('sanitizeText removes dangerous HTML tags', () => {
  assert.equal(sanitizeText('<script>alert("xss")</script>'), 'alert("xss")');
  assert.equal(sanitizeText('<img src=x onerror=alert(1)>'), '');
});

test('sanitizeText removes javascript URIs', () => {
  assert.equal(sanitizeText('javascript:alert(1)'), '');
  // Encoded variant
  assert.equal(sanitizeText('&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;:alert(1)'), '');
});

test('sanitizeText preserves Spanish characters', () => {
  const input = 'ÁÉÍÓÚÑÜ áéíóúñü,.;:!¿?()-@/#&\'\"';
  assert.equal(sanitizeText(input), input);
});

test('sanitizeText normalizes excessive whitespace', () => {
  const result = sanitizeText('hola     mundo');
  assert.equal(result, 'hola  mundo'); // max 2 spaces
});

test('sanitizeText removes backticks and dollar signs', () => {
  assert.equal(sanitizeText('`backtick` $variable'), 'backtick variable');
});
```

---

## Verification Gates

```bash
# 1. Run tests
cd backend && npm test
# Expected: all tests pass (updated sanitizeText tests + existing tests)

# 2. Test dangerous payloads
node -e "
  import { sanitizeText } from './src/validation.js';
  const tests = [
    ['<script>alert(1)</script>', 'alert(1)'],
    ['<img src=x onerror=alert(1)>', ''],
    ['javascript:alert(1)', ''],
    ['ÁÉÍÓÚÑÜ áéíóúñü', 'ÁÉÍÓÚÑÜ áéíóúñü'],
    ['<svg onload=alert(1)>', ''],
  ];
  let pass = 0;
  for (const [input, expected] of tests) {
    const result = sanitizeText(input);
    if (result === expected) { pass++; }
    else { console.log('FAIL:', JSON.stringify(input), '→', JSON.stringify(result), '(expected:', JSON.stringify(expected) + ')'); }
  }
  console.log(pass + '/' + tests.length + ' passed');
"

# 3. Confirm no regressions in body validation
cd backend && node -e "
  import { validateBody } from './src/validation.js';
  const r = validateBody({
    medioRespuesta: 'cartelera',
    tipoSolicitud: 'peticion',
    asunto: 'Solicito información sobre mi PQRS',
    descripcion: 'El pasado 15 de marzo presenté una solicitud... Contiene ñ, tildes, y puntuación.',
    aceptarTratamiento: true,
  });
  console.log(r.ok ? 'PASS: valid body passes' : 'FAIL: ' + JSON.stringify(r.errors));
"
```

---

## Files in Scope
- `backend/src/validation.js` — replace `sanitizeText` implementation
- `backend/src/validation.test.js` — update tests

## Files Explicitly Out of Scope
- `backend/package.json` (no new dependencies with Option A)
- `backend/src/app.js`
- `backend/src/server-helpers.js`

---

## Conventions to Follow
- Whitelist approach (Option A) — no new dependencies
- Error messages in Spanish (no changes needed, messages stay same)
- Existing tests should be updated to match new behavior
- Test file uses `node:test` + `node:assert/strict`

---

## Test Plan
1. Run `npm test` — all validation tests must pass
2. Manual test: submit a request with `<script>` or `javascript:` in description — should be stripped
3. Manual test: submit with Spanish characters, punctuation — should be preserved

---

## STOP Conditions
- If removing `javascript:` or `data:` from blacklist breaks existing assumptions (e.g., a test expects specific removal behavior), STOP and update the test accordingly
- If any legitimate character is blocked that users need for PQRS descriptions, STOP and add it to the whitelist
- If tests fail, STOP and report
