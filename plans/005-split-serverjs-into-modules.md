# Plan 003 — Split server.js into Modules

**Finding:** `backend/src/server.js` (and related `app.js`) concentrate API HTTP, DB bootstrap, worker init, persistence, error handling, and lifecycle management in a single flow. This makes testing, maintenance, and isolated changes difficult.
**Category:** Tech Debt / Architecture
**Impact:** HIGH — blocks testability, makes deployment fragile
**Effort:** M (Medium)
**Risk:** MEDIUM — structural refactor, requires careful extraction
**Evidence:** `backend/src/server.js`, `backend/src/app.js`, `backend/src/server-helpers.js`, `backend/src/worker.js`

---

## Current State

**Current structure of backend/src/:**
```
backend/src/
├── app.js                  # Express app factory (routes, CORS, rate limit, multer, error handler)
├── config.js               # Env vars collection
├── constants.js            # File validation constants
├── db.js                   # PostgreSQL pool connection
├── pereiraAutomation.js    # Playwright automation
├── server-helpers.js       # DB bootstrap, persistReceivedRequest, cleanupFiles, buildTrackingCode
├── server.js               # Entry: loads env, creates app, checks production requirements, starts server + worker
├── validation.js           # Zod validation + sanitization
├── validation.test.js      # Tests for validation
└── worker.js               # Worker loop, job claiming, processing, marking success/failure
```

**Problems:**
- `server-helpers.js` mixes DB bootstrap logic with request persistence and file management — it's a "helpers" dumping ground
- `app.js` is ~240 lines with route handlers, validation, file processing all in one function
- `server.js` handles production env validation AND server startup in the same file
- No separation of concerns: routes, services, repositories are all interleaved

---

## Required Changes

### Step 1: Create `backend/src/routes/` directory and split route handlers

**Create `backend/src/routes/health.js`:**
```js
import { Router } from 'express';

export default function createHealthRouter() {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ ok: true, service: 'pereira-pqrs-backend' });
  });

  return router;
}
```

**Create `backend/src/routes/index.js`:**
```js
import { Router } from 'express';

export default function createRootRouter() {
  const router = Router();

  router.get('/', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'pereira-pqrs-backend',
      hint: 'Usa /health o /api/pqrs/*',
    });
  });

  return router;
}
```

**Create `backend/src/routes/pqrs.js`** — extract from `app.js`:

This file contains the POST `/api/pqrs/submit-anonymous` and GET `/api/pqrs/status/:trackingCode` routes. Move these from `app.js`:

```js
import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { MAX_FILES, MAX_FILE_SIZE_BYTES } from '../constants.js';
import { validateBody, validateFiles, mapToHumanValues } from '../validation.js';
import { buildTrackingCode, persistReceivedRequest, cleanupFiles, queryTrackingStatus } from '../services/request.service.js';
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

export default function createPqrsRouter() {
  const router = Router();

  router.get('/status/:trackingCode', async (req, res) => {
    const trackingCode = String(req.params.trackingCode || '').trim();
    if (!trackingCode) {
      return res.status(400).json({ ok: false, code: 'INVALID_TRACKING_CODE', message: 'trackingCode es requerido' });
    }

    try {
      const data = await queryTrackingStatus(trackingCode);
      if (!data) {
        return res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'No existe una solicitud con ese trackingCode' });
      }
      return res.status(200).json({ ok: true, data });
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

    const fileValidation = validateFiles(files);
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
      },
    });
  });

  return router;
}
```

### Step 2: Create `backend/src/middleware/` directory

**Create `backend/src/middleware/auth.js`:**
```js
export function requireBackendAuth(BACKEND_API_TOKEN) {
  return (req, res, next) => {
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
  };
}
```

**Create `backend/src/middleware/error-handler.js`:**
```js
import multer from 'multer';

export function errorHandler(err, _req, res, _next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ ok: false, code: 'LIMIT_FILE_SIZE', message: 'Un archivo supera 27 MB' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ ok: false, code: 'LIMIT_FILE_COUNT', message: 'Solo se permiten 10 archivos' });
    }
    return res.status(400).json({ ok: false, code: err.code, message: err.message });
  }

  return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: 'Error interno no controlado' });
}
```

### Step 3: Create `backend/src/services/` directory

**Move persistence logic from `server-helpers.js` into `backend/src/services/request.service.js`:**
```js
import { pool, query } from '../db.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export function buildTrackingCode() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `PETE-${timestamp}-${suffix}`;
}

export async function persistReceivedRequest({ trackingCode, payload, files }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertRequest = await client.query(
      `INSERT INTO requests (
        client_tracking_code, status, medio_respuesta, correo,
        tipo_solicitud, asunto, descripcion_original, descripcion_formal, attempts
      ) VALUES ($1, 'recibido', $2, $3, $4, $5, $6, $7, 0)
      RETURNING id`,
      [trackingCode, payload.medioRespuesta, payload.correo || null,
       payload.tipoSolicitud, payload.asunto, payload.descripcion, payload.descripcion]
    );

    const requestId = insertRequest.rows[0].id;

    await client.query(
      `INSERT INTO request_status_events (request_id, from_status, to_status, reason, detail)
       VALUES ($1, NULL, 'recibido', 'api_submission', 'Solicitud recibida por el backend')`,
      [requestId]
    );

    if (files.length > 0) {
      for (const file of files) {
        const ext = path.extname(file.originalname || '').toLowerCase();
        await client.query(
          `INSERT INTO request_attachments (request_id, original_name, mime_type, extension, size_bytes, storage_path, sha256)
           VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
          [requestId, file.originalname, file.mimetype, ext, file.size, file.path]
        );
      }
    }

    await client.query(
      `INSERT INTO automation_jobs (request_id, queue_name, job_state, retry_count)
       VALUES ($1, 'pqrs-radicacion', 'pending', 0)
       ON CONFLICT (request_id)
       DO UPDATE SET job_state = EXCLUDED.job_state, retry_count = automation_jobs.retry_count, updated_at = NOW()`,
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

export async function queryTrackingStatus(trackingCode) {
  const requestResult = await query(
    `SELECT id, client_tracking_code, status,
       (SELECT job_state FROM automation_jobs WHERE request_id = requests.id LIMIT 1) AS job_state,
       medio_respuesta, tipo_solicitud, asunto,
       consecutivo_oficial, radicado_oficial, portal_message,
       attempts, last_error_code, last_error_message,
       created_at, updated_at
     FROM requests
     WHERE client_tracking_code = $1
     LIMIT 1`,
    [trackingCode]
  );

  if (requestResult.rowCount === 0) return null;

  const r = requestResult.rows[0];

  const eventsResult = await query(
    `SELECT to_status, reason, detail, created_at
     FROM request_status_events
     WHERE request_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [r.id]
  );

  return {
    requestId: r.id,
    trackingCode: r.client_tracking_code,
    status: r.status,
    jobState: r.job_state,
    medioRespuesta: r.medio_respuesta,
    tipoSolicitud: r.tipo_solicitud,
    asunto: r.asunto,
    consecutivoOficial: r.consecutivo_oficial,
    radicadoOficial: r.radicado_oficial,
    portalMessage: r.portal_message,
    attempts: r.attempts,
    lastErrorCode: r.last_error_code,
    lastErrorMessage: r.last_error_message,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    events: eventsResult.rows,
  };
}

export async function cleanupFiles(files) {
  await Promise.allSettled((files || []).map((file) => fs.unlink(file.path)));
}
```

**Create `backend/src/services/database.service.js`:**
```js
import { query } from '../db.js';

export async function ensureDatabaseBootstrap() {
  const REQUIRED_TABLES = ['requests', 'request_status_events', 'request_attachments', 'automation_jobs'];
  const missingTablesResult = await query(
    `SELECT required.table_name
     FROM unnest($1::text[]) AS required(table_name)
     LEFT JOIN information_schema.tables t
       ON t.table_schema = 'public' AND t.table_name = required.table_name
     WHERE t.table_name IS NULL`,
    [REQUIRED_TABLES]
  );

  if (missingTablesResult.rowCount > 0) {
    const missingTables = missingTablesResult.rows.map((row) => row.table_name).join(', ');
    throw new Error(`Schema incompleto. Faltan tablas: ${missingTables}. Ejecuta primero el setup local.`);
  }

  const constraintResult = await query(
    `SELECT EXISTS (
       SELECT 1 FROM pg_constraint c
       JOIN pg_class rel ON rel.oid = c.conrelid
       JOIN pg_namespace ns ON ns.oid = rel.relnamespace
       JOIN unnest(c.conkey) AS k(attnum) ON true
       JOIN pg_attribute a ON a.attrelid = rel.oid AND a.attnum = k.attnum
       WHERE ns.nspname = 'public' AND rel.relname = 'automation_jobs'
         AND c.contype IN ('u', 'p')
       GROUP BY c.oid
       HAVING bool_or(a.attname = 'request_id')
     ) AS has_constraint`
  );

  if (!constraintResult.rows[0]?.has_constraint) {
    throw new Error('Schema invalido. automation_jobs.request_id requiere UNIQUE o PRIMARY KEY.');
  }
}
```

### Step 4: Simplify `app.js`

```js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import createHealthRouter from './routes/health.js';
import createRootRouter from './routes/index.js';
import createPqrsRouter from './routes/pqrs.js';
import { requireBackendAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';

export function createApp(BACKEND_API_TOKEN) {
  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, code: 'TOO_MANY_REQUESTS', message: 'Demasiadas solicitudes. Intenta en 15 minutos.' },
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
    app.use('/api/pqrs', requireBackendAuth(BACKEND_API_TOKEN));
  }

  app.use('/', createRootRouter());
  app.use('/health', createHealthRouter());
  app.use('/api/pqrs', createPqrsRouter());

  app.use(errorHandler);

  return app;
}
```

### Step 5: Simplify `server.js`

```js
import './config.js';
import { createApp } from './app.js';
import { startAutomationWorker } from './worker.js';
import { ensureDatabaseBootstrap } from './services/database.service.js';
import {
  BACKEND_API_TOKEN,
  NODE_ENV,
  PORT,
  WORKER_ENABLED
} from './config.js';

validateProductionEnv();

const app = createApp(BACKEND_API_TOKEN);

app.listen(PORT, async () => {
  console.log(`PQRS backend listening on port ${PORT}`);

  try {
    await ensureDatabaseBootstrap();
    if (WORKER_ENABLED) {
      startAutomationWorker();
    }
  } catch (error) {
    console.error(`Startup failed: ${error.message}`);
    process.exit(1);
  }
});

function validateProductionEnv() {
  if (NODE_ENV !== 'production') return;

  if (!BACKEND_API_TOKEN) {
    throw new Error('BACKEND_API_TOKEN es obligatorio en produccion. Define la variable en .env antes de iniciar.');
  }
  if (!process.env.DB_PASSWORD) {
    throw new Error('DB_PASSWORD es obligatorio en produccion. Define la variable en .env antes de iniciar.');
  }
}
```

### Step 6: Delete `backend/src/server-helpers.js`

Once all its functions are moved to `services/request.service.js` and `services/database.service.js`, delete the old file.

### Step 7: Update `worker.js` imports

Change imports in `worker.js` from:
```js
import { pool, query } from './db.js';
```
(keep this, it's fine)

Make sure `cleanupRequestFiles` in worker uses correct path from `services/request.service.js` if we move that helper there.

---

## Verification Gates

```bash
# 1. Check directory structure
ls backend/src/routes/
# Expected: health.js index.js pqrs.js

ls backend/src/services/
# Expected: request.service.js database.service.js

ls backend/src/middleware/
# Expected: auth.js error-handler.js

# 2. Check old server-helpers.js is gone
test ! -f backend/src/server-helpers.js && echo "OK - deleted"

# 3. Type-check (if available, otherwise syntax check)
cd backend && node -e "import('./src/app.js').then(() => console.log('OK - app.js loads'))"

# 4. Run tests
cd backend && npm test
# Expected: all existing tests pass

# 5. Start server (will fail DB but should import cleanly)
cd backend && timeout 3 node src/server.js 2>&1 || true
# Expected: error about DB connection, NOT about import errors

# 6. Check for any remaining imports from server-helpers
grep -rn "server-helpers" backend/src/ || echo "OK - no references to server-helpers remain"
```

---

## Files in Scope

**Create:**
- `backend/src/routes/health.js`
- `backend/src/routes/index.js`
- `backend/src/routes/pqrs.js`
- `backend/src/middleware/auth.js`
- `backend/src/middleware/error-handler.js`
- `backend/src/services/request.service.js`
- `backend/src/services/database.service.js`

**Modify:**
- `backend/src/app.js`
- `backend/src/server.js`
- `backend/src/worker.js` (update imports if needed)

**Delete:**
- `backend/src/server-helpers.js`

## Files Explicitly Out of Scope
- `backend/src/validation.js`
- `backend/src/constants.js`
- `backend/src/config.js`
- `backend/src/db.js`
- `backend/src/pereiraAutomation.js`

---

## Conventions to Follow
- ES modules (`import`/`export`) matching existing style
- Each file has a single responsibility
- Routes directory mirrors URL structure (`/health` → `routes/health.js`)
- Services named with `.service.js` suffix
- Middleware named with descriptive filename

---

## Test Plan
1. Run `npm test` — all existing validation tests must pass
2. Import test: `node -e "import('./src/app.js')"` must not throw
3. Start server with `timeout 3 node src/server.js` — must fail on DB connection (not import error)

---

## Maintenance Note
When adding new endpoints:
1. Create route file in `routes/` (or add to existing)
2. Add service functions in `services/`
3. Register route in `app.js`
4. Add auth middleware in `middleware/auth.js` if needed

---

## STOP Conditions
- If `import` errors appear when loading `app.js`, STOP — the file exports or paths may differ
- If any test fails, STOP and report — do not modify tests or suppress failures
- If `server-helpers.js` has functions not accounted for above (re-check all exports), STOP and report
