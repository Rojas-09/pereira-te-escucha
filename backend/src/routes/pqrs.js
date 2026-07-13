import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { MAX_FILES, MAX_FILE_SIZE_BYTES } from '../constants.js';
import { validateBody, validateFiles, mapToHumanValues } from '../validation.js';
import { buildTrackingCode as buildTrackingCodeReal, persistReceivedRequest as persistReceivedRequestReal, cleanupFiles as cleanupFilesReal } from '../services/request.service.js';
import { queryTrackingStatus as queryTrackingStatusReal } from '../services/database.service.js';
import rateLimit from 'express-rate-limit';

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
    fileSize: MAX_FILE_SIZE_BYTES,
  },
});

export default function createPqrsRouter(services = {}) {
  const {
    buildTrackingCode = buildTrackingCodeReal,
    persistReceivedRequest = persistReceivedRequestReal,
    cleanupFiles = cleanupFilesReal,
    queryTrackingStatus = queryTrackingStatusReal,
  } = services;
  const router = Router();

  router.get('/status/:trackingCode', async (req, res) => {
    const trackingCode = String(req.params.trackingCode || '').trim();
    if (!trackingCode) {
      return res.status(400).json({ ok: false, code: 'INVALID_TRACKING_CODE', message: 'trackingCode es requerido' });
    }

    try {
      const data = await queryTrackingStatus(trackingCode);
      if (!data) {
        return res.status(404).json({
          ok: false,
          code: 'NOT_FOUND',
          message: 'No existe una solicitud con ese trackingCode',
        });
      }
      return res.status(200).json({ ok: true, data });
    } catch (error) {
      req.log.error({ err: error }, 'Failed to fetch status by tracking code');
      return res.status(500).json({
        ok: false,
        code: 'DATABASE_READ_FAILED',
        message: 'No fue posible consultar el estado de la solicitud',
      });
    }
  });

  router.post('/submit-anonymous', submitLimiter, upload.array('files', MAX_FILES), async (req, res) => {
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

    const fileValidation = await validateFiles(files);
    if (!fileValidation.ok) {
      await cleanupFiles(files);
      return res.status(400).json({ ok: false, code: 'FILE_VALIDATION_ERROR', errors: fileValidation.errors });
    }

    const payload = mapToHumanValues(bodyValidation.data);
    const trackingCode = buildTrackingCode();
    let requestId = null;

    try {
      requestId = await persistReceivedRequest({ trackingCode, payload, files });
    } catch (error) {
      req.log.error({ err: error }, 'Failed to persist received request');
      await cleanupFiles(files);
      return res.status(500).json({
        ok: false,
        code: 'DATABASE_WRITE_FAILED',
        message: 'No fue posible guardar la solicitud en base de datos',
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
      },
    });
  });

  return router;
}
