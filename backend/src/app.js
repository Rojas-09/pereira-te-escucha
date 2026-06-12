import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import createHealthRouter from './routes/health.js';
import createRootRouter from './routes/index.js';
import createPqrsRouter from './routes/pqrs.js';
import { requireBackendAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';

export function createApp(BACKEND_API_TOKEN, options = {}) {
  const {
    pqrsServices = {},
  } = options;
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
  app.use('/api/pqrs', createPqrsRouter(pqrsServices));

  Sentry.setupExpressErrorHandler(app);

  app.use(errorHandler);

  return app;
}
