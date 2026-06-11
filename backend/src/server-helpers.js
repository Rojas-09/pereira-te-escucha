import { pool, query } from './db.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { MAX_FILES, MAX_FILE_SIZE_BYTES } from './constants.js';
import { mapToHumanValues, validateBody, validateFiles } from './validation.js';

export async function ensureDatabaseBootstrap() {
  const REQUIRED_TABLES = ['requests', 'request_status_events', 'request_attachments', 'automation_jobs'];
  const missingTablesResult = await query(
    `SELECT required.table_name
     FROM unnest($1::text[]) AS required(table_name)
     LEFT JOIN information_schema.tables t
       ON t.table_schema = 'public'
      AND t.table_name = required.table_name
      WHERE t.table_name IS NULL`,
    [REQUIRED_TABLES]
  );

  if (missingTablesResult.rowCount > 0) {
    const missingTables = missingTablesResult.rows.map((row) => row.table_name).join(', ');
    throw new Error(
      `Schema incompleto. Faltan tablas: ${missingTables}. Ejecuta primero el setup local o la migracion de base de datos.`
    );
  }

  const requestIdConstraintResult = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_constraint c
       JOIN pg_class rel ON rel.oid = c.conrelid
       JOIN pg_namespace ns ON ns.oid = rel.relnamespace
       JOIN unnest(c.conkey) AS k(attnum) ON true
       JOIN pg_attribute a
         ON a.attrelid = rel.oid
        AND a.attnum = k.attnum
        WHERE ns.nspname = 'public'
          AND rel.relname = 'automation_jobs'
          AND c.contype IN ('u', 'p')
        GROUP BY c.oid
        HAVING bool_or(a.attname = 'request_id')
      ) AS has_constraint`
  );

  if (!requestIdConstraintResult.rows[0]?.has_constraint) {
    throw new Error(
      'Schema invalido. automation_jobs.request_id requiere una restriccion UNIQUE o PRIMARY KEY para soportar ON CONFLICT.'
    );
  }
}

export function buildTrackingCode() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = Math.floor(1000 + Math.random() * 9000);
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
        await client.query(
          `INSERT INTO request_attachments (
            request_id,
            original_name,
            mime_type,
            extension,
            size_bytes,
            storage_path,
            sha256
          ) VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
          [requestId, file.originalname, file.mimetype, ext, file.size, file.path]
        );
      }
    }

    await client.query(
      `INSERT INTO automation_jobs (
        request_id,
        queue_name,
        job_state,
        retry_count
      ) VALUES ($1, 'pqrs-radicacion', 'pending', 0)
      ON CONFLICT (request_id)
      DO UPDATE SET
        job_state = EXCLUDED.job_state,
        retry_count = automation_jobs.retry_count,
        updated_at = NOW()`,
      [requestId]
    );

    await client.query('COMMIT');
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
