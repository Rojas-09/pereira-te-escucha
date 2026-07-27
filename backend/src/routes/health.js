import { Router } from 'express';
import { pool } from '../db.js';
import { chromium } from 'playwright';
import { NODE_ENV, PEREIRA_FORM_URL, PLAYWRIGHT_HEADLESS, PLAYWRIGHT_TIMEOUT_MS, MAX_FILES, MAX_FILE_SIZE_BYTES } from '../config.js';

export default function createHealthRouter() {
  const router = Router();

  router.get('/', async (_req, res) => {
    let dbStatus = 'disconnected';
    try {
      await pool.query('SELECT 1');
      dbStatus = 'connected';
    } catch {
      dbStatus = 'disconnected';
    }

    res.json({ ok: true, service: 'pereira-pqrs-backend', db: dbStatus });
  });

  router.get('/playwright', async (_req, res) => {
    let pwStatus = 'unavailable';
    let pwVersion = null;
    try {
      pwVersion = chromium.version();
      pwStatus = 'available';
    } catch {
      pwStatus = 'unavailable';
    }
    res.json({ ok: pwStatus === 'available', service: 'playwright', status: pwStatus, version: pwVersion });
  });

  router.get('/diagnostics', async (_req, res) => {
    let dbStatus = 'disconnected';
    try {
      await pool.query('SELECT 1');
      dbStatus = 'connected';
    } catch {
      dbStatus = 'disconnected';
    }

    let pwStatus = 'unavailable';
    let pwVersion = null;
    try {
      pwVersion = chromium.version();
      pwStatus = 'available';
    } catch {
      pwStatus = 'unavailable';
    }

    res.json({
      ok: dbStatus === 'connected' && pwStatus === 'available',
      service: 'pereira-pqrs-backend',
      environment: NODE_ENV,
      database: { status: dbStatus },
      playwright: { status: pwStatus, version: pwVersion },
      config: {
        formUrl: PEREIRA_FORM_URL,
        headless: PLAYWRIGHT_HEADLESS,
        timeoutMs: PLAYWRIGHT_TIMEOUT_MS,
        maxFiles: MAX_FILES,
        maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
      },
    });
  });

  return router;
}
