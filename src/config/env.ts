import { Platform } from 'react-native';

const trimTrailingSlashes = (url: string) => url.replace(/\/+$/, '');

export const API_BASE_URL = (() => {
  const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configuredUrl) return trimTrailingSlashes(configuredUrl);
  if (__DEV__) {
    return Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
  }
  throw new Error(
    'EXPO_PUBLIC_API_BASE_URL no está configurado. ' +
    'Define esta variable en .env (ej: https://api.tudominio.com) antes de compilar para producción.'
  );
})();

export const BACKEND_API_TOKEN = process.env.EXPO_PUBLIC_BACKEND_API_TOKEN?.trim() || '';
export const SUBMIT_TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_SUBMIT_TIMEOUT_MS || 45000);
export const STATUS_TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_STATUS_TIMEOUT_MS || 7000);
export const STATUS_POLL_BASE_MS = Number(process.env.EXPO_PUBLIC_STATUS_POLL_BASE_MS || 5000);
export const STATUS_POLL_MAX_MS = Number(process.env.EXPO_PUBLIC_STATUS_POLL_MAX_MS || 60000);
export const STATUS_POLL_JITTER_PCT = Math.min(0.5, Math.max(0, Number(process.env.EXPO_PUBLIC_STATUS_POLL_JITTER_PCT || 0.2)));
export const STATUS_POLL_MAX_ELAPSED_MS = Number(process.env.EXPO_PUBLIC_STATUS_POLL_MAX_ELAPSED_MS || 1800000);
export const STATUS_POLL_MAX_ATTEMPTS = Number(process.env.EXPO_PUBLIC_STATUS_POLL_MAX_ATTEMPTS || 40);
export const STATUS_POLL_MAX_CONSECUTIVE_ERRORS = Number(process.env.EXPO_PUBLIC_STATUS_POLL_MAX_CONSECUTIVE_ERRORS || 5);
export const STATUS_RESUME_STALE_MS = Number(process.env.EXPO_PUBLIC_STATUS_RESUME_STALE_MS || 10000);
export const PQRD_TYPES = ['Peticion', 'Queja', 'Reclamo', 'Denuncia', 'Sugerencia'] as const;

export const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() || '';
