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

  try {
    const result = await submitAnonymousPQRS({
      formUrl: PEREIRA_FORM_URL,
      payload,
      files,
      headless: PLAYWRIGHT_HEADLESS,
      timeoutMs: PLAYWRIGHT_TIMEOUT_MS
    });

    return res.status(200).json({
      ok: true,
      data: result
    });
  } catch (error) {
    req.log.error({ err: error }, 'Failed to submit anonymous PQRS');
    return res.status(502).json({
      ok: false,
      code: 'REMOTE_SUBMISSION_FAILED',
      message: 'No fue posible completar la radicacion en este intento',
      detail: error.message
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

async function cleanupFiles(files) {
  await Promise.allSettled((files || []).map((file) => fs.unlink(file.path)));
}
