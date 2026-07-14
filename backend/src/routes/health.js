import { Router } from 'express';
import { pool } from '../db.js';
import { chromium } from 'playwright';

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

  return router;
}
