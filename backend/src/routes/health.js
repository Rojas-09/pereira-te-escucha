import { Router } from 'express';
import { pool } from '../db.js';

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

  return router;
}
