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
