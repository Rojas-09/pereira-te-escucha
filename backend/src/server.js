import dotenv from 'dotenv';
import { createApp } from './app.js';
import { startAutomationWorker } from './worker.js';
import { pool, query } from './db.js';
import { ensureDatabaseBootstrap } from './server-helpers.js';
import {
  BACKEND_API_TOKEN,
  NODE_ENV,
  PEREIRA_FORM_URL,
  PLAYWRIGHT_HEADLESS,
  PLAYWRIGHT_TIMEOUT_MS,
  PORT,
  WORKER_ENABLED
} from './config.js';

dotenv.config();

if (NODE_ENV === 'production') {
  if (!BACKEND_API_TOKEN) {
    throw new Error('BACKEND_API_TOKEN es obligatorio en produccion. Define la variable en .env antes de iniciar.');
  }
  if (!process.env.DB_PASSWORD) {
    throw new Error('DB_PASSWORD es obligatorio en produccion. Define la variable en .env antes de iniciar.');
  }
}

const app = createApp(BACKEND_API_TOKEN, PEREIRA_FORM_URL);

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
