export function requireBackendAuth(backendApiToken) {
  return (req, res, next) => {
    const authHeader = String(req.headers.authorization || '').trim();
    const bearerPrefix = 'Bearer ';
    const providedToken = authHeader.startsWith(bearerPrefix) ? authHeader.slice(bearerPrefix.length).trim() : '';

    if (!providedToken || providedToken !== backendApiToken) {
      return res.status(401).json({
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Credencial de acceso invalida o ausente',
      });
    }

    return next();
  };
}
