import { Router } from 'express';

export default function createHealthRouter() {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ ok: true, service: 'pereira-pqrs-backend' });
  });

  return router;
}
