import { Worker } from 'bullmq';
import { query } from './db.js';
import { PEREIRA_FORM_URL, PLAYWRIGHT_HEADLESS, PLAYWRIGHT_TIMEOUT_MS } from './config.js';
import { submitAnonymousPQRS } from './pereiraAutomation.js';
import { logger } from './services/logger.js';

const REDIS_URL = process.env.REDIS_URL;
const connection = REDIS_URL
  ? { url: REDIS_URL }
  : { host: '127.0.0.1', port: 6379 };

async function processJob(job) {
  const { requestId } = job.data;
  logger.info({ requestId, attempt: job.attemptsMade }, 'Processing job');

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
      timeoutMs: PLAYWRIGHT_TIMEOUT_MS,
    });

    await markRequestSuccessful(requestId, result);
  } catch (error) {
    logger.error({ requestId, attempt: job.attemptsMade, err: error.message }, 'Job attempt failed');

    await query(
      `INSERT INTO request_status_events (request_id, from_status, to_status, reason, detail)
       VALUES ($1, 'en_proceso', 'error_temporal', 'automation_retry', $2)`,
      [requestId, `Intento ${job.attemptsMade + 1} fallido: ${String(error.message).slice(0, 500)}`]
    );

    throw error;
  } finally {
    await cleanupRequestFiles(requestId);
  }
}

export function setupWorker() {
  const worker = new Worker('pqrs-radicacion', processJob, {
    connection,
    concurrency: 1,
  });

  worker.on('failed', async (job, error) => {
    const { requestId } = job.data;
    logger.error({ requestId, err: error.message, attempts: job.attemptsMade }, 'Job failed after all retries');
    await markRequestFailed(requestId, error, `Fallo tras ${job.attemptsMade} intentos`);
  });

  worker.on('error', (error) => {
    logger.error(error, 'Worker connection error');
  });

  worker.on('ready', () => {
    logger.info('BullMQ worker connected to Redis, waiting for jobs');
  });

  return worker;
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
}

async function markRequestFailed(requestId, error, detailMessage) {
  const message = detailMessage || String(error?.message || 'Fallo no controlado').slice(0, 1000);

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
