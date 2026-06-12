import { TrackingSnapshot } from '../types';
import { fetchWithTimeout, readJsonSafe, buildBackendHeaders } from './api';
import { shouldContinuePolling, parseRetryAfterMs } from '../utils/formatters';

export type TrackingResult = {
  ok: boolean;
  terminal: boolean;
  statusChanged: boolean;
  retryAfterMs: number | null;
  snapshot?: TrackingSnapshot;
};

export async function fetchTrackingStatus(
  code: string,
  apiBaseUrl: string,
  token: string,
  timeoutMs: number
): Promise<TrackingResult> {
  if (!code) return { ok: false, terminal: true, statusChanged: false, retryAfterMs: null };

  try {
    const response = await fetchWithTimeout(
      `${apiBaseUrl}/api/pqrs/status/${encodeURIComponent(code)}`,
      { method: 'GET', headers: buildBackendHeaders(token) },
      timeoutMs
    );

    if (response.status === 304) {
      return { ok: true, terminal: false, statusChanged: false, retryAfterMs: null };
    }
    if (response.status === 429 || response.status === 503) {
      return {
        ok: false, terminal: false, statusChanged: false,
        retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after')),
      };
    }

    const payload = await readJsonSafe<{ ok?: boolean; data?: TrackingSnapshot; message?: string }>(response);
    if (!response.ok || !payload?.ok || !payload?.data) {
      throw new Error(payload?.message || `HTTP ${response.status}`);
    }

    return {
      ok: true,
      terminal: !shouldContinuePolling(payload.data.status),
      statusChanged: true,
      retryAfterMs: null,
      snapshot: payload.data,
    };
  } catch (error) {
    return { ok: false, terminal: false, statusChanged: false, retryAfterMs: null };
  }
}
