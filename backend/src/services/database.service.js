import { query } from '../db.js';

export async function ensureDatabaseBootstrap() {
  const REQUIRED_TABLES = ['requests', 'request_status_events', 'request_attachments'];
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
}

export async function queryTrackingStatus(trackingCode) {
  const requestResult = await query(
    `SELECT
      id,
      client_tracking_code,
      status,
      CASE requests.status
        WHEN 'recibido' THEN 'pending'
        WHEN 'en_proceso' THEN 'active'
        WHEN 'radicado' THEN 'completed'
        WHEN 'fallo' THEN 'failed'
        ELSE 'unknown'
      END AS job_state,
      medio_respuesta,
      tipo_solicitud,
      asunto,
      consecutivo_oficial,
      radicado_oficial,
      portal_message,
      attempts,
      last_error_code,
      last_error_message,
      created_at,
      updated_at
    FROM requests
    WHERE client_tracking_code = $1
    LIMIT 1`,
    [trackingCode]
  );

  if (requestResult.rowCount === 0) return null;

  const r = requestResult.rows[0];

  const eventsResult = await query(
    `SELECT to_status, reason, detail, created_at
     FROM request_status_events
     WHERE request_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [r.id]
  );

  return {
    requestId: r.id,
    trackingCode: r.client_tracking_code,
    status: r.status,
    jobState: r.job_state,
    medioRespuesta: r.medio_respuesta,
    tipoSolicitud: r.tipo_solicitud,
    asunto: r.asunto,
    consecutivoOficial: r.consecutivo_oficial,
    radicadoOficial: r.radicado_oficial,
    portalMessage: r.portal_message,
    attempts: r.attempts,
    lastErrorCode: r.last_error_code,
    lastErrorMessage: r.last_error_message,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    events: eventsResult.rows,
  };
}
