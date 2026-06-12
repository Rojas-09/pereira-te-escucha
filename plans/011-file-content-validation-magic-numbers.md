# Plan 011 — File Content Validation (Magic Numbers)

**Finding:** The backend validates file extensions and MIME types (`constants.js`) but not actual file content. A `.pdf` renamed to `.jpg` or a malicious file with a valid extension would pass validation. The system needs magic number validation using the `file-type` package.
**Category:** Security
**Impact:** HIGH — acceptance of spoofed/malicious files
**Effort:** M (Medium)
**Risk:** LOW — additive check, doesn't break existing flow
**Evidence:** `backend/src/validation.js:58-82` (validateFiles), `backend/src/constants.js` (ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES)

---

## Current State

**`backend/src/validation.js` — `validateFiles()` (lines 58-82):**
```js
export function validateFiles(files = []) {
  // ...
  files.forEach((file, index) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      errors.push({ path: `files.${index}`, message: `Extension no permitida (${ext || 'sin extension'})` });
    }

    if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      errors.push({ path: `files.${index}`, message: `Tipo de archivo no permitido (${file.mimetype})` });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      errors.push({ path: `files.${index}`, message: `El archivo ${file.originalname} supera 27 MB` });
    }

    if (file.originalname && (file.originalname.includes('..') || file.originalname.includes('/'))) {
      errors.push({ path: `files.${index}`, message: `Nombre de archivo invalido` });
    }
  });
  // ...
}
```

The current validation checks:
- File extension (from file name)
- MIME type (from HTTP upload metadata)
- File size
- Path traversal in filename

It does NOT check what the file actually contains.

---

## Required Changes

### 1. Install dependency

```bash
cd backend && npm install file-type
```

`file-type` detects file types by reading magic number signatures (first bytes of the file). It works with ESM and Node.js 20+.

### 2. Map extensions to file-type results in `backend/src/constants.js`

Add:
```js
// Map of file-type results to allowed extensions
export const MAGIC_NUMBER_ALLOWED = new Map([
  ['application/pdf', ['.pdf']],
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['image/gif', ['.gif']],
  ['image/tiff', ['.tif', '.tiff']],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['.xlsx']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['.docx']],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', ['.pptx']],
  ['application/vnd.ms-excel', ['.xls']],
  ['application/msword', ['.doc']],
  ['application/vnd.ms-powerpoint', ['.ppt']],
]);
```

### 3. Add magic number validation to `backend/src/validation.js`

Add a new async function and update `validateFiles`:

```js
import { fileTypeFromFile } from 'file-type';
import { ALLOWED_EXTENSIONS, MAX_FILES, MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES, MAGIC_NUMBER_ALLOWED } from './constants.js';

export async function validateFileContent(filePath) {
  try {
    const type = await fileTypeFromFile(filePath);
    return type || null; // returns { ext: 'jpg', mime: 'image/jpeg' } or null
  } catch {
    return null;
  }
}

export async function validateFilesWithContent(files = []) {
  // Same as validateFiles but with content check
}
```

**IMPORTANT:** Since `validateFiles` is currently synchronous and called synchronously in `app.js`, changing it to async requires updating the route handler.

### 4. Update `backend/src/app.js` — make file validation async

In the `POST /api/pqrs/submit-anonymous` route, change:
```js
const fileValidation = validateFiles(files);
```
to:
```js
const fileValidation = await validateFiles(files);
```

And update `validateFiles` in `validation.js` to be async, adding the magic number check after existing checks:

```js
export async function validateFiles(files = []) {
  if (!Array.isArray(files)) {
    return { ok: false, errors: [{ path: 'files', message: 'files debe ser un arreglo' }] };
  }

  if (files.length > MAX_FILES) {
    return { ok: false, errors: [{ path: 'files', message: `Solo se permiten ${MAX_FILES} archivos` }] };
  }

  const errors = [];
  for (const [index, file] of files.entries()) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      errors.push({ path: `files.${index}`, message: `Extension no permitida (${ext || 'sin extension'})` });
      continue; // Skip further checks if extension is invalid
    }

    if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      errors.push({ path: `files.${index}`, message: `Tipo MIME declarado no permitido (${file.mimetype})` });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      errors.push({ path: `files.${index}`, message: `El archivo ${file.originalname} supera 27 MB` });
    }

    if (file.originalname && (file.originalname.includes('..') || file.originalname.includes('/'))) {
      errors.push({ path: `files.${index}`, message: 'Nombre de archivo invalido' });
    }

    // NEW: Magic number content validation
    if (file.path) {
      try {
        const detectedType = await fileTypeFromFile(file.path);
        if (detectedType) {
          const allowedExts = MAGIC_NUMBER_ALLOWED.get(detectedType.mime);
          if (!allowedExts || !allowedExts.includes(ext)) {
            errors.push({
              path: `files.${index}`,
              message: `El contenido del archivo (${detectedType.mime}) no coincide con la extension declarada (${ext})`,
            });
          }
        }
        // If fileTypeFromFile returns null (unknown type), allow it if extension is in allowed list
        // This handles cases where the file type is not detected (e.g., encrypted files)
      } catch (contentError) {
        errors.push({
          path: `files.${index}`,
          message: `No fue posible verificar el contenido del archivo: ${contentError.message}`,
        });
      }
    }
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  return { ok: true };
}
```

### 5. Update `backend/src/app.js` route handler

Update the route to `await` the file validation:

```js
const fileValidation = await validateFiles(files);
```

### 6. Update `backend/src/validation.test.js`

Add tests for magic number validation (these will need actual files):

```js
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('validateFiles rejects renamed .exe pretending to be .jpg', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'pqrs-test-'));
  const fakeFile = join(tmpDir, 'malware.jpg');
  // Write a real PE executable header (MZ) — these bytes identify .exe files
  writeFileSync(fakeFile, Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]));

  const result = await validateFiles([{
    originalname: 'malware.jpg',
    mimetype: 'image/jpeg',
    size: 1000,
    path: fakeFile,
  }]);

  unlinkSync(fakeFile);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.message.includes('no coincide con la extension')));
});

test('validateFiles accepts real .jpg content', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'pqrs-test-'));
  const realFile = join(tmpDir, 'photo.jpg');
  // Write a real JPEG header (FF D8 FF)
  writeFileSync(realFile, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]));

  const result = await validateFiles([{
    originalname: 'photo.jpg',
    mimetype: 'image/jpeg',
    size: 1000,
    path: realFile,
  }]);

  unlinkSync(realFile);

  assert.equal(result.ok, true);
});
```

---

## Verification Gates

```bash
# 1. Install file-type
cd backend && npm install file-type
# Expected: package installed, no errors

# 2. Run existing tests
cd backend && npm test
# Expected: all existing tests pass

# 3. Run new tests
cd backend && node --test src/validation.test.js
# Expected: all tests pass (old + new)

# 4. Test magic number detection manually
node -e "
  import { fileTypeFromFile } from 'file-type';
  import { writeFileSync } from 'node:fs';
  import { join } from 'node:path';
  import { tmpdir } from 'node:os';
  const f = join(tmpdir(), 'test-file.jpg');
  writeFileSync(f, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));
  const t = await fileTypeFromFile(f);
  console.log('Detected:', t?.mime, t?.ext);
"
# Expected: Detected: image/jpeg jpg

# 5. Check app.js uses async validation
grep -n "await validateFiles" backend/src/app.js
# Expected: shows line number with await validateFiles(files)
```

---

## Files in Scope
- `backend/src/validation.js` — make `validateFiles` async, add content check
- `backend/src/validation.test.js` — add magic number tests
- `backend/src/app.js` — use `await validateFiles(files)`
- `backend/src/constants.js` — add `MAGIC_NUMBER_ALLOWED` map
- `backend/package.json` — add `file-type` dependency (via `npm install`)

## Files Explicitly Out of Scope
- `backend/src/pereiraAutomation.js`
- `backend/src/worker.js`
- Frontend files

---

## Conventions to Follow
- Import `fileTypeFromFile` from `file-type` package (ESM only)
- Keep existing synchronous `validateFiles` callers working by making it async
- Error messages in Spanish
- Clean up temp files in tests (use try/finally)

---

## Test Plan
1. `npm test` — all existing + new tests pass
2. Manual: submit a request with a renamed file (e.g., `.txt` renamed to `.pdf`) — should be rejected with "el contenido del archivo no coincide"

---

## STOP Conditions
- If `file-type` fails to install (check Node version ≥ 18), STOP and report
- If any existing caller of `validateFiles` is synchronous and not updated to `await`, STOP and check all references with `grep -rn "validateFiles" backend/src/`
- If tests fail, STOP and report

---

## `file-type` Compatibility Note
`file-type@19+` is ESM-only and requires Node.js ≥ 18. This project uses `"type": "module"` and `"node": "^20"` so it's compatible. If the installed version is too new, pin to `file-type@19`.
