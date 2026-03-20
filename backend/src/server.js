import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import pinoHttp from 'pino-http';
import dotenv from 'dotenv';
import { MAX_FILES, MAX_FILE_SIZE_BYTES } from './constants.js';
import { mapToHumanValues, validateBody, validateFiles } from './validation.js';
import { submitAnonymousPQRS } from './pereiraAutomation.js';
import { pool, query } from './db.js';

dotenv.config();

const PORT = Number(process.env.PORT || 3001);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const PEREIRA_FORM_URL = process.env.PEREIRA_FORM_URL || 'https://doc.pereira.gov.co/ws/pqr/index.html';
const PLAYWRIGHT_HEADLESS = (process.env.PLAYWRIGHT_HEADLESS || 'true').toLowerCase() !== 'false';
const PLAYWRIGHT_TIMEOUT_MS = Number(process.env.PLAYWRIGHT_TIMEOUT_MS || 90000);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(os.tmpdir(), 'pqrs-files');
      fs.mkdir(dir, { recursive: true }).then(() => cb(null, dir)).catch((error) => cb(error));
    },
    filename: (_req, file, cb) => {
      const safeName = `${Date.now()}-${crypto.randomUUID()}-${file.originalname.replace(/\s+/g, '_')}`;
      cb(null, safeName);
    }
  }),
  limits: {
    files: MAX_FILES,
    fileSize: MAX_FILE_SIZE_BYTES
  }
});

const app = express();
app.use(helmet());
app.use(cors({ origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN }));
app.use(express.json({ limit: '2mb' }));
app.use(pinoHttp());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'pereira-pqrs-backend' });
});

app.get('/api/pqrs/status/:trackingCode', async (req, res) => {
  const trackingCode = String(req.params.trackingCode || '').trim();
  if (!trackingCode) {
    return res.status(400).json({ ok: false, code: 'INVALID_TRACKING_CODE', message: 'trackingCode es requerido' });
  }

  try {
    const requestResult = await query(
      `SELECT
        id,
        client_tracking_code,
        status,
        medio_respuesta,
        tipo_solicitud,
        asunto,
        consecutivo_oficial,
        radicado_oficial,
        portal_message,
        attempts,
        last_error_code,
        last_error_message,
        created_at,
        updated_at
      FROM requests
      WHERE client_tracking_code = $1
      LIMIT 1`,
      [trackingCode]
    );

    if (requestResult.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        code: 'NOT_FOUND',
        message: 'No existe una solicitud con ese trackingCode',
      });
    }

    const requestData = requestResult.rows[0];

    const eventsResult = await query(
      `SELECT to_status, reason, detail, created_at
       FROM request_status_events
       WHERE request_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [requestData.id]
    );

    return res.status(200).json({
      ok: true,
      data: {
        trackingCode: requestData.client_tracking_code,
        status: requestData.status,
        medioRespuesta: requestData.medio_respuesta,
        tipoSolicitud: requestData.tipo_solicitud,
        asunto: requestData.asunto,
        consecutivoOficial: requestData.consecutivo_oficial,
        radicadoOficial: requestData.radicado_oficial,
        portalMessage: requestData.portal_message,
        attempts: requestData.attempts,
        lastErrorCode: requestData.last_error_code,
        lastErrorMessage: requestData.last_error_message,
        createdAt: requestData.created_at,
        updatedAt: requestData.updated_at,
        events: eventsResult.rows,
      },
    });
  } catch (error) {
    req.log.error({ err: error }, 'Failed to fetch status by tracking code');
    return res.status(500).json({
      ok: false,
      code: 'DATABASE_READ_FAILED',
      message: 'No fue posible consultar el estado de la solicitud',
      detail: error.message,
    });
  }
});

app.post('/api/pqrs/submit-anonymous', upload.array('files', MAX_FILES), async (req, res) => {
  const files = req.files || [];

  const bodyValidation = validateBody(req.body);
  if (!bodyValidation.ok) {
    await cleanupFiles(files);
    return res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', errors: bodyValidation.errors });
  }

  const fileValidation = validateFiles(files);
  if (!fileValidation.ok) {
    await cleanupFiles(files);
    return res.status(400).json({ ok: false, code: 'FILE_VALIDATION_ERROR', errors: fileValidation.errors });
  }

  const payload = mapToHumanValues(bodyValidation.data);
  const trackingCode = buildTrackingCode();
  let requestId = null;

  try {
    requestId = await persistReceivedRequest({
      trackingCode,
      payload,
      files,
    });
  } catch (error) {
    req.log.error({ err: error }, 'Failed to persist received request');
    await cleanupFiles(files);
    return res.status(500).json({
      ok: false,
      code: 'DATABASE_WRITE_FAILED',
      message: 'No fue posible guardar la solicitud en base de datos',
      detail: error.message,
    });
  }

  try {
    await markRequestProcessing(requestId);

    const result = await submitAnonymousPQRS({
      formUrl: PEREIRA_FORM_URL,
      payload,
      files,
      headless: PLAYWRIGHT_HEADLESS,
      timeoutMs: PLAYWRIGHT_TIMEOUT_MS
    });

    await markRequestSuccessful(requestId, result);

    return res.status(200).json({
      ok: true,
      data: {
        requestId,
        trackingCode,
        ...result,
      }
    });
  } catch (error) {
    req.log.error({ err: error }, 'Failed to submit anonymous PQRS');

    try {
      if (requestId) {
        await markRequestFailed(requestId, error);
      }
    } catch (dbError) {
      req.log.error({ err: dbError }, 'Failed to persist failure state');
    }

    return res.status(502).json({
      ok: false,
      code: 'REMOTE_SUBMISSION_FAILED',
      message: 'No fue posible completar la radicacion en este intento',
      detail: error.message,
      trackingCode,
    });
  } finally {
    await cleanupFiles(files);
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ ok: false, code: 'LIMIT_FILE_SIZE', message: 'Un archivo supera 27 MB' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ ok: false, code: 'LIMIT_FILE_COUNT', message: 'Solo se permiten 10 archivos' });
    }
    return res.status(400).json({ ok: false, code: error.code, message: error.message });
  }

  return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: 'Error interno no controlado' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`PQRS backend listening on port ${PORT}`);
});

function buildTrackingCode() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `PETE-${timestamp}-${suffix}`;
}

async function persistReceivedRequest({ trackingCode, payload, files }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertRequest = await client.query(
      `INSERT INTO requests (
        client_tracking_code,
        status,
        medio_respuesta,
        correo,
        tipo_solicitud,
        asunto,
        descripcion_original,
        descripcion_formal,
        attempts
      ) VALUES ($1, 'recibido', $2, $3, $4, $5, $6, $7, 0)
      RETURNING id`,
      [
        trackingCode,
        payload.medioRespuesta,
        payload.correo || null,
        payload.tipoSolicitud,
        payload.asunto,
        payload.descripcion,
        payload.descripcion,
      ]
    );

    const requestId = insertRequest.rows[0].id;

    await client.query(
      `INSERT INTO request_status_events (
        request_id,
        from_status,
        to_status,
        reason,
        detail
      ) VALUES ($1, NULL, 'recibido', 'api_submission', 'Solicitud recibida por el backend')`,
      [requestId]
    );

    if (files.length > 0) {
      for (const file of files) {
        const ext = path.extname(file.originalname || '').toLowerCase();
        await client.query(
          `INSERT INTO request_attachments (
            request_id,
            original_name,
            mime_type,
            extension,
            size_bytes,
            storage_path,
            sha256
          ) VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
          [requestId, file.originalname, file.mimetype, ext, file.size, file.path]
        );
      }
    }

    await client.query(
      `INSERT INTO automation_jobs (
        request_id,
        queue_name,
        job_state,
        retry_count
      ) VALUES ($1, 'pqrs-radicacion', 'pending', 0)
      ON CONFLICT (request_id)
      DO UPDATE SET
        job_state = EXCLUDED.job_state,
        retry_count = automation_jobs.retry_count,
        updated_at = NOW()`,
      [requestId]
    );

    await client.query('COMMIT');
    return requestId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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

async function markRequestFailed(requestId, error) {
  const message = String(error?.message || 'Fallo no controlado').slice(0, 1000);

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
    ) VALUES ($1, 'en_proceso', 'fallo', 'automation_error', $2)`,
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

async function cleanupFiles(files) {
  await Promise.allSettled((files || []).map((file) => fs.unlink(file.path)));
}
