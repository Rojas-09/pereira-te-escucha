import dotenv from 'dotenv';
import * as Sentry from '@sentry/node';
import { createApp } from './app.js';
import { startAutomationWorker } from './worker.js';
import { ensureDatabaseBootstrap } from './services/database.service.js';
import {
  ALLOWED_ORIGIN,
  BACKEND_API_TOKEN,
  NODE_ENV,
  PORT,
  WORKER_ENABLED
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
  if (!process.env.DB_PASSWORD) {
    throw new Error('DB_PASSWORD es obligatorio en produccion. Define la variable en .env antes de iniciar.');
  }
  if (!ALLOWED_ORIGIN || ALLOWED_ORIGIN === '*') {
    throw new Error('ALLOWED_ORIGIN debe ser un origen específico (no *) en producción. Define la variable en .env antes de iniciar.');
  }
}

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
