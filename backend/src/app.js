import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { MAX_FILES, MAX_FILE_SIZE_BYTES } from './constants.js';
import { validateBody, validateFiles, mapToHumanValues } from './validation.js';
import { buildTrackingCode, persistReceivedRequest, cleanupFiles } from './server-helpers.js';

export function createApp(BACKEND_API_TOKEN, PEREIRA_FORM_URL) {
  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, code: 'TOO_MANY_REQUESTS', message: 'Demasiadas solicitudes. Intenta en 15 minutos.' },
  });

  const submitLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, code: 'SUBMIT_RATE_LIMITED', message: 'Limite de radicaciones alcanzado. Intenta en 1 hora.' },
  });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const dir = path.join(os.tmpdir(), 'pqrs-files');
        fs.mkdir(dir, { recursive: true }).then(() => cb(null, dir)).catch((error) => cb(error));
      },
      filename: (_req, file, cb) => {
        const safeName = `${Date.now()}-${crypto.randomUUID()}-${file.originalname.replace(/\s+/g, '_')}`;
        cb(null, safeName);
      },
    }),
    limits: {
      files: MAX_FILES,
      fileSize: MAX_FILE_SIZE_BYTES
    },
  });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors({ origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN }));
  app.use(express.json({ limit: '2mb' }));
  app.use(pinoHttp());
  app.use(generalLimiter);

  if (BACKEND_API_TOKEN) {
    app.use('/api/pqrs', requireBackendAuth);
  }

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'pereira-pqrs-backend' });
  });

  app.get('/', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'pereira-pqrs-backend',
      hint: 'Usa /health o /api/pqrs/*',
    });
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
          (
            SELECT job_state
            FROM automation_jobs
            WHERE request_id = requests.id
            LIMIT 1
          ) AS job_state,
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
          requestId: requestData.id,
          trackingCode: requestData.client_tracking_code,
          status: requestData.status,
          jobState: requestData.job_state,
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

  app.post('/api/pqrs/submit-anonymous', submitLimiter, upload.array('files', MAX_FILES), async (req, res) => {
    const files = req.files || [];

    req.log.info(
      {
        endpoint: '/api/pqrs/submit-anonymous',
        contentType: req.headers['content-type'] || null,
        bodyKeys: Object.keys(req.body || {}),
        filesCount: files.length,
      },
      'Submit request received'
    );

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

    const statusPath = `/api/pqrs/status/${encodeURIComponent(trackingCode)}`;
    res.setHeader('Location', statusPath);
    res.setHeader('Retry-After', '5');

    return res.status(202).json({
      ok: true,
      code: 'ACCEPTED',
      message: 'Solicitud recibida. La radicacion se procesara en segundo plano.',
      data: {
        requestId,
        trackingCode,
        status: 'recibido',
        jobState: 'pending',
        statusUrl: statusPath,
        pollAfterMs: 5000,
        acceptedAt: new Date().toISOString(),
      }
    });
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

  return app;
}

function requireBackendAuth(req, res, next) {
  const authHeader = String(req.headers.authorization || '').trim();
  const bearerPrefix = 'Bearer ';
  const providedToken = authHeader.startsWith(bearerPrefix) ? authHeader.slice(bearerPrefix.length).trim() : '';

  if (!providedToken || providedToken !== BACKEND_API_TOKEN) {
    return res.status(401).json({
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Credencial de acceso invalida o ausente',
    });
  }

  return next();
}
