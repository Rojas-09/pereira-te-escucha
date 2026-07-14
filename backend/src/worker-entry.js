import dotenv from 'dotenv';
import { startAutomationWorker, stopAutomationWorker } from './worker.js';
import { ensureDatabaseBootstrap } from './services/database.service.js';
import { logger } from './services/logger.js';

dotenv.config();

async function main() {
  try {
    await ensureDatabaseBootstrap();
  } catch (error) {
    logger.error(error, 'Worker startup failed: database bootstrap');
    process.exit(1);
  }

  logger.info('Worker process started');

  startAutomationWorker();

  const shutdown = () => {
    logger.info('Shutting down worker...');
    stopAutomationWorker();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
