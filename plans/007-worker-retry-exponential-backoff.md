# Plan 007 — Worker Retry with Exponential Backoff

**Finding:** The automation worker in `worker.js` has no retry mechanism. When `submitAnonymousPQRS` fails (e.g. portal is down, selectors changed, network error), the job goes directly to `failed` state after one attempt. This reduces reliability and requires manual re-triggering.
**Category:** Performance / Reliability
**Impact:** MEDIUM — single failures leave jobs permanently failed
**Effort:** M (Medium)
**Risk:** LOW — additive change, doesn't break existing logic
**Evidence:** `backend/src/worker.js:128-153` (markRequestFailed), no retry loop exists

---

## Current State

**`worker.js` — `processNextPendingJob()` (lines 55-76):**
```js
export async function processNextPendingJob() {
  const claimed = await claimNextPendingJob();
  if (!claimed) return;

  const { requestId, jobId } = claimed;
  try {
    const jobData = await loadRequestJobData(requestId);
    if (!jobData) throw new Error(`No se encontro informacion para requestId=${requestId}`);
    await markRequestProcessing(requestId);
    const result = await submitAnonymousPQRS({
      formUrl: PEREIRA_FORM_URL, payload: jobData.payload, files: jobData.files,
      headless: PLAYWRIGHT_HEADLESS, timeoutMs: PLAYWRIGHT_TIMEOUT_MS
    });
    await markRequestSuccessful(requestId, result);
  } catch (error) {
    console.error(`Worker failed for requestId=${requestId}, jobId=${jobId}: ${error.message}`);
    await markRequestFailed(requestId, error);
  } finally {
    await cleanupRequestFiles(requestId);
  }
}
```

**`markRequestFailed()` (lines 128-153):**
```js
async function markRequestFailed(requestId, error) {
  // ... sets status to 'fallo', records error, increments retry_count
  // BUT: does NOT check if retry_count < max_retries to re-queue
}
```

The `automation_jobs` table has a `retry_count` column but it's never used for re-queuing.

---

## Required Changes

### 1. Add retry config to `backend/src/config.js`

Add after existing exports:
```js
export const WORKER_MAX_RETRIES = Number(process.env.WORKER_MAX_RETRIES || 3);
export const WORKER_RETRY_BASE_MS = Number(process.env.WORKER_RETRY_BASE_MS || 5000);
```

### 2. Update `backend/src/worker.js` — `processNextPendingJob()`

Replace the function with retry logic:

```js
import { WORKER_MAX_RETRIES, WORKER_RETRY_BASE_MS } from './config.js';

export async function processNextPendingJob() {
  const claimed = await claimNextPendingJob();
  if (!claimed) return;

  const { requestId, jobId } = claimed;

  try {
    const jobData = await loadRequestJobData(requestId);
    if (!jobData) throw new Error(`No se encontro informacion para requestId=${requestId}`);

    await markRequestProcessing(requestId);

    const result = await submitAnonymousPQRS({
      formUrl: PEREIRA_FORM_URL,
      payload: jobData.payload,
      files: jobData.files,
      headless: PLAYWRIGHT_HEADLESS,
      timeoutMs: PLAYWRIGHT_TIMEOUT_MS,
    });

    await markRequestSuccessful(requestId, result);
    return;
  } catch (error) {
    console.error(`Worker failed for requestId=${requestId}, jobId=${jobId}: ${error.message}`);
    await handleJobFailure(requestId, error);
  } finally {
    await cleanupRequestFiles(requestId);
  }
}
```

### 3. Add `handleJobFailure()` to `backend/src/worker.js`

```js
export async function handleJobFailure(requestId, error) {
  const message = String(error?.message || 'Fallo no controlado').slice(0, 1000);

  // Get current retry count
  const jobResult = await query(
    `SELECT retry_count FROM automation_jobs WHERE request_id = $1`,
    [requestId]
  );

  const currentRetries = jobResult.rows[0]?.retry_count ?? 0;
  const nextRetryCount = currentRetries + 1;

  if (nextRetryCount < WORKER_MAX_RETRIES) {
    // Schedule retry with exponential backoff
    const delayMs = WORKER_RETRY_BASE_MS * (2 ** (nextRetryCount - 1));
    const scheduledAt = new Date(Date.now() + delayMs).toISOString();
    const logDetail = `Reintento ${nextRetryCount}/${WORKER_MAX_RETRIES} programado para +${delayMs}ms: ${message}`;

    await query(
      `UPDATE automation_jobs
       SET job_state = 'pending',
           retry_count = $2,
           scheduled_at = $3,
           updated_at = NOW()
       WHERE request_id = $1`,
      [requestId, nextRetryCount, scheduledAt]
    );

    await query(
      `INSERT INTO request_status_events (request_id, from_status, to_status, reason, detail)
       VALUES ($1, 'en_proceso', 'error_temporal', 'automation_retry', $2)`,
      [requestId, logDetail]
    );

    console.log(`Worker scheduled retry ${nextRetryCount} for requestId=${requestId} in ${delayMs}ms`);
  } else {
    // Max retries exhausted — permanent failure
    await markRequestFailed(requestId, error, message);
  }
}
```

### 4. Update `claimNextPendingJob()` to respect `scheduled_at`

```js
async function claimNextPendingJob() {
  const result = await query(
    `WITH next_job AS (
       SELECT id, request_id
       FROM automation_jobs
       WHERE queue_name = 'pqrs-radicacion'
         AND job_state = 'pending'
         AND (scheduled_at IS NULL OR scheduled_at <= NOW())
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE automation_jobs aj
        SET job_state = 'active',
            updated_at = NOW()
       FROM next_job
      WHERE aj.id = next_job.id
      RETURNING aj.id AS job_id, aj.request_id`,
    []
  );

  if (result.rowCount === 0) return null;

  return {
    jobId: result.rows[0].job_id,
    requestId: result.rows[0].request_id,
  };
}
```

### 5. Update `markRequestFailed()` to accept error message

```js
async function markRequestFailed(requestId, error, messageOverride) {
  const message = messageOverride || String(error?.message || 'Fallo no controlado').slice(0, 1000);

  await query(
    `UPDATE requests
     SET status = 'fallo',
         attempts = attempts + 1,
         last_error_code = 'REMOTE_SUBMISSION_FAILED',
         last_error_message = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [requestId, message]
  );

  await query(
    `INSERT INTO request_status_events (request_id, from_status, to_status, reason, detail)
     VALUES ($1, 'en_proceso', 'fallo', 'automation_failed', $2)`,
    [requestId, message]
  );

  await query(
    `UPDATE automation_jobs
     SET job_state = 'failed',
         retry_count = retry_count + 1,
         updated_at = NOW()
     WHERE request_id = $1`,
    [requestId]
  );
}
```

### 6. DB Migration: Add `scheduled_at` column

Run this SQL on the PostgreSQL database:
```sql
ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT NULL;
```

Also create an index for query performance:
```sql
CREATE INDEX IF NOT EXISTS idx_automation_jobs_pending_scheduled
  ON automation_jobs (job_state, scheduled_at)
  WHERE job_state = 'pending';
```

This can be added to the local setup script or run manually.

---

## Verification Gates

```bash
# 1. Check scheduled_at column exists
psql "$DATABASE_URL" -c "\d automation_jobs" 2>/dev/null | grep scheduled_at
# Expected: scheduled_at | timestamp with time zone | ...

# 2. Syntax check
cd backend && node --check src/worker.js
# Expected: no output (success)

# 3. Run tests
cd backend && npm test
# Expected: all pass

# 4. Simulate retry logic (dry run in isolation)
node -e "
  const WORKER_MAX_RETRIES = 3;
  const WORKER_RETRY_BASE_MS = 5000;
  for (let retry = 1; retry <= 3; retry++) {
    const delayMs = WORKER_RETRY_BASE_MS * (2 ** (retry - 1));
    console.log('Retry', retry, 'delay:', delayMs, 'ms');
  }
"
# Expected:
# Retry 1 delay: 5000 ms
# Retry 2 delay: 10000 ms
# Retry 3 delay: 20000 ms
```

---

## Files in Scope
- `backend/src/config.js` — add `WORKER_MAX_RETRIES` and `WORKER_RETRY_BASE_MS`
- `backend/src/worker.js` — add `handleJobFailure`, update `processNextPendingJob`, `claimNextPendingJob`, `markRequestFailed`
- Database: add `scheduled_at` column to `automation_jobs`

## Files Explicitly Out of Scope
- `backend/src/app.js`
- `backend/src/pereiraAutomation.js`
- Any frontend files

---

## Conventions to Follow
- Error messages in Spanish
- Backoff formula: `WORKER_RETRY_BASE_MS * (2 ** (retryCount - 1))`
- Max retries defaults to 3 (configurable via env)
- `scheduled_at` uses UTC timestamps
- Existing `automation_jobs.retry_count` column is already present — no need to add

---

## Test Plan
1. Existing `npm test` must pass
2. Integration test (manual): submit a request, then simulate portal failure by setting invalid `PEREIRA_FORM_URL` in `.env`. Observe that worker retries 3 times with increasing delays before marking as `fallo`.
3. Check DB: `SELECT retry_count, scheduled_at FROM automation_jobs WHERE request_id = X` should show increasing retry count and future scheduled_at.

---

## STOP Conditions
- If `automation_jobs` table does not exist or has different schema, STOP and report
- If `WORKER_MAX_RETRIES` is already defined in `config.js`, adjust to use the existing value
- If tests fail, STOP and report
