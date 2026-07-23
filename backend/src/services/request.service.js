import { pool, query } from '../db.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { computeFileHash } from './hash.service.js';
import getQueue from '../queue.js';
import { logger } from './logger.js';

export function buildTrackingCode() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = crypto.randomUUID().split('-')[0];
  return `PETE-${timestamp}-${suffix}`;
}

export async function persistReceivedRequest({ trackingCode, payload, files }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertRequest = await client.query(
      `INSERT INTO requests (
        client_tracking_code,
        status,
        medio_respuesta,
        correo,
        tipo_solicitud,
        asunto,
        descripcion_original,
        descripcion_formal,
        attempts
      ) VALUES ($1, 'recibido', $2, $3, $4, $5, $6, $7, 0)
      RETURNING id`,
      [
        trackingCode,
        payload.medioRespuesta,
        payload.correo || null,
        payload.tipoSolicitud,
        payload.asunto,
        payload.descripcion,
        payload.descripcion,
      ]
    );

    const requestId = insertRequest.rows[0].id;

    await client.query(
      `INSERT INTO request_status_events (
        request_id,
        from_status,
        to_status,
        reason,
        detail
      ) VALUES ($1, NULL, 'recibido', 'api_submission', 'Solicitud recibida por el backend')`,
      [requestId]
    );

    if (files.length > 0) {
      for (const file of files) {
        const ext = path.extname(file.originalname || '').toLowerCase();
        let fileHash = null;
        try {
          fileHash = await computeFileHash(file.path);
        } catch (hashError) {
          console.warn(`No se pudo calcular hash para ${file.originalname}: ${hashError.message}`);
        }

        await client.query(
          `INSERT INTO request_attachments (
            request_id,
            original_name,
            mime_type,
            extension,
            size_bytes,
            storage_path,
            sha256
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [requestId, file.originalname, file.mimetype, ext, file.size, file.path, fileHash]
        );
      }
    }

    await client.query('COMMIT');

    try {
      await getQueue().add('submit', { requestId });
    } catch (queueError) {
      logger.error({ requestId, err: queueError.message }, 'Failed to enqueue job');
    }

    return requestId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function cleanupFiles(files) {
  await Promise.allSettled((files || []).map((file) => fs.unlink(file.path)));
}
