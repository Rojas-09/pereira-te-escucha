import { TrackingSnapshot } from '../types';

export function formatAddressFromReverseGeocode(result: {
  street?: string;
  streetNumber?: string;
  district?: string;
  city?: string;
  region?: string;
} | null): string {
  if (!result) return 'Direccion no disponible para este punto.';
  const parts = [result.street, result.streetNumber, result.district, result.city, result.region]
    .filter(Boolean)
    .join(', ')
    .replace(/\s+/g, ' ')
    .trim();
  return parts || 'Direccion no disponible para este punto.';
}

export function formatTrackingStatusLabel(status: string): string {
  switch (status) {
    case 'recibido': return 'Recibido';
    case 'en_proceso': return 'En proceso';
    case 'radicado': return 'Radicado';
    case 'error_temporal': return 'Error temporal';
    case 'fallido': case 'fallo': return 'Fallido';
    default: return status;
  }
}

export function formatStatusDate(value?: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('es-CO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function parseRetryAfterMs(retryAfterHeader: string | null): number | null {
  if (!retryAfterHeader) return null;
  const seconds = Number(retryAfterHeader);
  if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
  const retryAt = new Date(retryAfterHeader).getTime();
  if (!Number.isNaN(retryAt)) return Math.max(0, retryAt - Date.now());
  return null;
}

export function computeBackoffDelayMs(
  attempt: number,
  baseMs: number,
  maxMs: number,
  jitterPct: number
): number {
  const exponent = Math.max(0, attempt - 1);
  const rawDelay = Math.min(maxMs, baseMs * (2 ** exponent));
  const jitterFactor = 1 + ((Math.random() * 2 - 1) * jitterPct);
  return Math.max(1000, Math.round(rawDelay * jitterFactor));
}

export function generateSubjectFromMessage(message: string, type: string): string {
  const compact = message.replace(/\s+/g, ' ').trim();
  const firstSlice = compact.slice(0, 80);
  return firstSlice ? `${type}: ${firstSlice}` : `${type}: Solicitud ciudadana`;
}

export function mapTypeToApi(value: string): string {
  const n = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (n === 'peticion') return 'peticion';
  if (n === 'queja') return 'queja';
  if (n === 'reclamo') return 'reclamo';
  if (n === 'sugerencia') return 'sugerencia';
  return 'denuncia';
}

export function shouldContinuePolling(status: string): boolean {
  return status === 'recibido' || status === 'en_proceso' || status === 'error_temporal';
}
