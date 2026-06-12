import { pool, query } from './db.js';
import { PEREIRA_FORM_URL, PLAYWRIGHT_HEADLESS, PLAYWRIGHT_TIMEOUT_MS, WORKER_MAX_RETRIES, WORKER_RETRY_BASE_MS } from './config.js';
import { submitAnonymousPQRS } from './pereiraAutomation.js';

let workerLoopTimer = null;
let workerTickInProgress = false;

export function startAutomationWorker() {
  if (workerLoopTimer) {
    return;
  }

  const WORKER_POLL_MS = Number(process.env.WORKER_POLL_MS || 2500);

  const runTick = async () => {
    if (workerTickInProgress) {
      return;
    }

    workerTickInProgress = true;
    try {
      await processNextPendingJob();
    } catch (error) {
      console.error(`Worker tick failed: ${error.message}`);
    } finally {
      workerTickInProgress = false;
    }
  };

  workerLoopTimer = setInterval(() => {
    runTick().catch(() => {
      // handled in runTick
    });
  }, WORKER_POLL_MS);

  runTick().catch(() => {
    // handled in runTick
  });

  console.log(`Automation worker started (poll ${WORKER_POLL_MS}ms)`);
}

export async function processNextPendingJob() {
  const claimed = await claimNextPendingJob();
  if (!claimed) {
    return;
  }

  const { requestId, jobId } = claimed;

  try {
    const jobData = await loadRequestJobData(requestId);
    if (!jobData) {
      throw new Error(`No se encontro informacion para requestId=${requestId}`);
    }

    await markRequestProcessing(requestId);

    const result = await submitAnonymousPQRS({
      formUrl: PEREIRA_FORM_URL,
      payload: jobData.payload,
      files: jobData.files,
      headless: PLAYWRIGHT_HEADLESS,
      timeoutMs: PLAYWRIGHT_TIMEOUT_MS
    });

    await markRequestSuccessful(requestId, result);
  } catch (error) {
    console.error(`Worker failed for requestId=${requestId}, jobId=${jobId}: ${error.message}`);
    await handleJobFailure(requestId, error);
  } finally {
    await cleanupRequestFiles(requestId);
  }
}

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

  if (result.rowCount === 0) {
    return null;
  }

  return {
    jobId: result.rows[0].job_id,
    requestId: result.rows[0].request_id,
  };
}

async function loadRequestJobData(requestId) {
  const requestResult = await query(
    `SELECT
      medio_respuesta,
      correo,
      tipo_solicitud,
      asunto,
      descripcion_formal
     FROM requests
     WHERE id = $1
     LIMIT 1`,
    [requestId]
  );

  if (requestResult.rowCount === 0) {
    return null;
  }

  const requestRow = requestResult.rows[0];
  const attachmentsResult = await query(
    `SELECT storage_path AS path
     FROM request_attachments
     WHERE request_id = $1
     ORDER BY id ASC`,
    [requestId]
  );

  return {
    payload: {
      medioRespuesta: requestRow.medio_respuesta,
      correo: requestRow.correo || '',
      tipoSolicitud: requestRow.tipo_solicitud,
      asunto: requestRow.asunto,
      descripcion: requestRow.descripcion_formal,
    },
    files: attachmentsResult.rows,
  };
}

async function markRequestProcessing(requestId) {
  await query(
    `UPDATE requests
     SET status = 'en_proceso', updated_at = NOW()
     WHERE id = $1`,
    [requestId]
  );

  await query(
    `INSERT INTO request_status_events (
      request_id,
      from_status,
      to_status,
      reason,
      detail
    ) VALUES ($1, 'recibido', 'en_proceso', 'automation_start', 'Inicio de automatizacion Playwright')`,
    [requestId]
  );

  await query(
    `UPDATE automation_jobs
     SET job_state = 'active', updated_at = NOW()
     WHERE request_id = $1`,
    [requestId]
  );
}

async function markRequestSuccessful(requestId, result) {
  await query(
    `UPDATE requests
     SET status = 'radicado',
         attempts = attempts + 1,
         consecutivo_oficial = $2,
         radicado_oficial = $3,
         portal_message = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [requestId, result.consecutive || null, result.radicado || null, result.messageBody || null]
  );

  await query(
    `INSERT INTO request_status_events (
      request_id,
      from_status,
      to_status,
      reason,
      detail
    ) VALUES ($1, 'en_proceso', 'radicado', 'automation_success', $2)`,
    [requestId, result.messageBody || 'Radicacion completada']
  );

  await query(
    `UPDATE automation_jobs
     SET job_state = 'completed', updated_at = NOW()
     WHERE request_id = $1`,
    [requestId]
  );
}

export async function handleJobFailure(requestId, error) {
  const message = String(error?.message || 'Fallo no controlado').slice(0, 1000);

  const jobResult = await query(
    `SELECT retry_count FROM automation_jobs WHERE request_id = $1`,
    [requestId]
  );

  const currentRetries = jobResult.rows[0]?.retry_count ?? 0;
  const nextRetryCount = currentRetries + 1;

  if (nextRetryCount < WORKER_MAX_RETRIES) {
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
    await markRequestFailed(requestId, error, message);
  }
}

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
    `INSERT INTO request_status_events (
      request_id,
      from_status,
      to_status,
      reason,
      detail
    ) VALUES ($1, 'en_proceso', 'fallo', 'automation_failed', $2)`,
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

async function cleanupRequestFiles(requestId) {
  const attachmentsResult = await query(
    `SELECT storage_path
     FROM request_attachments
     WHERE request_id = $1`,
    [requestId]
  );

  await Promise.allSettled(
    attachmentsResult.rows
      .map((row) => row.storage_path)
      .filter(Boolean)
      .map((filePath) => import('node:fs/promises').then(fs => fs.unlink(filePath)))
  );
}

export function stopAutomationWorker() {
  if (workerLoopTimer) {
    clearInterval(workerLoopTimer);
    workerLoopTimer = null;
  }
  workerTickInProgress = false;
}
