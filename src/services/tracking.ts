import { API_BASE_URL, BACKEND_API_TOKEN } from '../config/env';
import { TrackingSnapshot } from '../types';
import { fetchWithTimeout, readJsonSafe, buildBackendHeaders } from './api';
import { parseRetryAfterMs, shouldContinuePolling } from '../utils/formatters';

export interface TrackingApiResult {
  ok: boolean;
  terminal: boolean;
  statusChanged: boolean;
  retryAfterMs: number | null;
  snapshot?: TrackingSnapshot;
  error?: string;
}

export async function fetchTrackingStatus(
  code: string,
  timeoutMs = 10000,
  previousStatus = ''
): Promise<TrackingApiResult> {
  if (!code) {
    return { ok: false, terminal: true, statusChanged: false, retryAfterMs: null };
  }

  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/pqrs/status/${encodeURIComponent(code)}`,
      { method: 'GET', headers: buildBackendHeaders(BACKEND_API_TOKEN) },
      timeoutMs
    );

    if (response.status === 304) {
      return { ok: true, terminal: false, statusChanged: false, retryAfterMs: null };
    }

    if (response.status === 429 || response.status === 503) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      return {
        ok: false,
        terminal: false,
        statusChanged: false,
        retryAfterMs,
        error: 'Mucho trafico en seguimiento. Reintentando automaticamente.',
      };
    }

    const payload = await readJsonSafe<{ ok?: boolean; data?: TrackingSnapshot; message?: string; detail?: string }>(response);

    if (!response.ok || !payload?.ok || !payload?.data) {
      throw new Error(
        payload?.message || payload?.detail || `No fue posible consultar el estado actual (HTTP ${response.status})`
      );
    }

    const nextStatus = payload.data.status || '';
    const statusChanged = previousStatus !== nextStatus;

    return {
      ok: true,
      terminal: !shouldContinuePolling(nextStatus),
      statusChanged,
      retryAfterMs: null,
      snapshot: payload.data as TrackingSnapshot,
    };
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message : 'No fue posible consultar el estado';
    return { ok: false, terminal: false, statusChanged: false, retryAfterMs: null, error: safeMessage };
  }
}
