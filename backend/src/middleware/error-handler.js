import multer from 'multer';

export function errorHandler(err, _req, res, _next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ ok: false, code: 'LIMIT_FILE_SIZE', message: 'Un archivo supera 27 MB' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ ok: false, code: 'LIMIT_FILE_COUNT', message: 'Solo se permiten 10 archivos' });
    }
    return res.status(400).json({ ok: false, code: err.code, message: err.message });
  }

  return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: 'Error interno no controlado' });
}
