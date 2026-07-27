import 'dotenv/config';

function normalizeOrigin(value) {
  return value?.trim() || '';
}

export function resolveAllowedOrigin(env = process.env) {
  const nodeEnv = (env.NODE_ENV || 'development').toLowerCase();
  const configuredOrigin = normalizeOrigin(env.ALLOWED_ORIGIN);

  if (nodeEnv === 'production') {
    if (!configuredOrigin || configuredOrigin === '*') {
      throw new Error('ALLOWED_ORIGIN must be set to a specific origin in production');
    }
    return configuredOrigin;
  }

  return configuredOrigin || '*';
}

export const PORT = Number(process.env.PORT || 3001);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const BACKEND_API_TOKEN = process.env.BACKEND_API_TOKEN?.trim() || '';
export const ALLOWED_ORIGIN = resolveAllowedOrigin(process.env);
export const PEREIRA_FORM_URL = process.env.PEREIRA_FORM_URL || 'https://doc.pereira.gov.co/ws/pqr/index.html';
export const PLAYWRIGHT_HEADLESS = (process.env.PLAYWRIGHT_HEADLESS || 'true').toLowerCase() !== 'false';
export const PLAYWRIGHT_TIMEOUT_MS = Number(process.env.PLAYWRIGHT_TIMEOUT_MS || 30000);
export const MAX_FILES = Number(process.env.MAX_FILES || 10);
export const MAX_FILE_SIZE_BYTES = Number(process.env.MAX_FILE_SIZE_BYTES || 27 * 1024 * 1024);
export const WORKER_MAX_RETRIES = Number(process.env.WORKER_MAX_RETRIES || 3);
export const WORKER_RETRY_BASE_MS = Number(process.env.WORKER_RETRY_BASE_MS || 5000);
