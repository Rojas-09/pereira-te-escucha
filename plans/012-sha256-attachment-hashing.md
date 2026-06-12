# Plan 012 — SHA-256 Attachment Hashing

**Finding:** The `request_attachments` table has a `sha256` column that is always stored as `NULL` (see `server-helpers.js:93-97`). Computing SHA-256 hashes for attachment files enables integrity verification, deduplication detection, and security auditing.
**Category:** Security / Data Integrity
**Impact:** MEDIUM — missed opportunity for file integrity verification
**Effort:** S (Small)
**Risk:** LOW — additive change to existing persistence flow
**Evidence:** `backend/src/server-helpers.js:93-97` (`sha256: NULL`)

---

## Current State

**`backend/src/server-helpers.js` — `persistReceivedRequest()` (lines 88-100):**
```js
if (files.length > 0) {
  for (const file of files) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    await client.query(
      `INSERT INTO request_attachments (
        request_id, original_name, mime_type, extension, size_bytes, storage_path, sha256
      ) VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
      [requestId, file.originalname, file.mimetype, ext, file.size, file.path]
    );
  }
}
```

The DB column exists (`sha256`) but is never populated.

---

## Required Changes

### 1. Create `backend/src/services/hash.service.js`

```js
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

/**
 * Compute SHA-256 hash of a file.
 * Uses streaming to handle large files without loading into memory.
 */
export async function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(new Error(`Error al leer archivo para hash: ${err.message}`)));
  });
}
```

### 2. Update `persistReceivedRequest` in `backend/src/server-helpers.js`

```js
import { computeFileHash } from './services/hash.service.js';

// Inside persistReceivedRequest, in the files loop:
if (files.length > 0) {
  for (const file of files) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    let fileHash = null;
    try {
      fileHash = await computeFileHash(file.path);
    } catch (hashError) {
      console.warn(`No se pudo calcular hash para ${file.originalname}: ${hashError.message}`);
      // Non-blocking: store NULL if hash fails
    }

    await client.query(
      `INSERT INTO request_attachments (
        request_id, original_name, mime_type, extension, size_bytes, storage_path, sha256
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [requestId, file.originalname, file.mimetype, ext, file.size, file.path, fileHash]
    );
  }
}
```

### 3. Update `backend/src/constants.js` (optional — add hash config)

```js
export const HASH_ALGORITHM = 'sha256';
```

### 4. Add test in `backend/src/validation.test.js` or new `backend/src/services/hash.service.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeFileHash } from './hash.service.js';

test('computeFileHash returns correct SHA-256 for known content', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'pqrs-hash-'));
  const testFile = join(tmpDir, 'test.txt');
  writeFileSync(testFile, 'hello world');

  const hash = await computeFileHash(testFile);
  unlinkSync(testFile);

  // SHA-256 of "hello world" (no newline)
  assert.equal(hash, 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
});

test('computeFileHash handles empty file', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'pqrs-hash-'));
  const testFile = join(tmpDir, 'empty.txt');
  writeFileSync(testFile, '');

  const hash = await computeFileHash(testFile);
  unlinkSync(testFile);

  // SHA-256 of empty string
  assert.equal(hash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('computeFileHash rejects non-existent file', async () => {
  await assert.rejects(
    () => computeFileHash('/tmp/non-existent-file-xyz-123.test'),
    { message: /Error al leer archivo/ }
  );
});
```

---

## Verification Gates

```bash
# 1. Run hash tests
cd backend && node --test src/services/hash.service.test.js 2>&1
# Expected: all 3 hash tests pass

# 2. Run existing tests (ensure no regression)
cd backend && npm test
# Expected: all existing tests pass

# 3. Manual: submit a request with a file, check sha256 is stored
# After submitting via API:
psql "$DATABASE_URL" -c "SELECT original_name, sha256 FROM request_attachments LIMIT 5;"
# Expected: sha256 is not NULL for attachments

# 4. Verify SHA-256 manually
node -e "
  import crypto from 'node:crypto';
  import fs from 'node:fs';
  const filePath = '/tmp/pqrs-files/some-uploaded-file';  // replace with actual
  const hash = crypto.createHash('sha256');
  // Verify the hash matches what was stored
"

# 5. Check the persistReceivedRequest still works (if server-helpers was updated)
cd backend && node -e "import('./src/server-helpers.js')"
# Should load without import errors
```

---

## Files in Scope
- `backend/src/services/hash.service.js` — CREATE (new file)
- `backend/src/services/hash.service.test.js` — CREATE (new test file)
- `backend/src/server-helpers.js` — UPDATE (call computeFileHash)

## Files Explicitly Out of Scope
- `backend/src/constants.js` (optional — if you add HASH_ALGORITHM)
- `backend/src/app.js`
- `backend/src/worker.js`

---

## Conventions to Follow
- Use streaming (not reading entire file into memory) — handles large files
- Hash failure is non-blocking: log warning, store NULL
- SHA-256 hex format (64 hex chars, lowercase)
- Error messages in Spanish

---

## Test Plan
1. `node --test src/services/hash.service.test.js` — 3 tests: known hash, empty file, non-existent file
2. `npm test` — all existing tests still pass

---

## STOP Conditions
- If the `sha256` column doesn't exist in `request_attachments` (check schema first), STOP and add the column: `ALTER TABLE request_attachments ADD COLUMN sha256 VARCHAR(64) DEFAULT NULL;`
- If tests fail, STOP and report
