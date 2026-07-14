import dotenv from 'dotenv';
import * as Sentry from '@sentry/node';
import { createApp } from './app.js';
import { ensureDatabaseBootstrap } from './services/database.service.js';
import { logger } from './services/logger.js';
import {
  ALLOWED_ORIGIN,
  BACKEND_API_TOKEN,
  NODE_ENV,
  PORT
} from './config.js';

dotenv.config();

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  environment: NODE_ENV || 'development',
  enabled: NODE_ENV === 'production',
  tracesSampleRate: 0.1,
});

if (NODE_ENV === 'production') {
  if (!BACKEND_API_TOKEN) {
    throw new Error('BACKEND_API_TOKEN es obligatorio en produccion. Define la variable en .env antes de iniciar.');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL es obligatorio en produccion. Define la variable en .env antes de iniciar.');
  }
  if (!ALLOWED_ORIGIN || ALLOWED_ORIGIN === '*') {
    throw new Error('ALLOWED_ORIGIN debe ser un origen específico (no *) en producción. Define la variable en .env antes de iniciar.');
  }
}

const app = createApp(BACKEND_API_TOKEN);

app.listen(PORT, async () => {
  logger.info({ port: PORT }, 'PQRS backend started');

  try {
    await ensureDatabaseBootstrap();
  } catch (error) {
    logger.error(error, 'Backend startup failed');
    process.exit(1);
  }
});
