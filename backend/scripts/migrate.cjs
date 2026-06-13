const { execFileSync } = require('child_process');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Usage: DATABASE_URL=<render-db-url> node scripts/migrate.cjs');
  process.exit(1);
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS requests (
    id BIGSERIAL PRIMARY KEY,
    client_tracking_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    medio_respuesta TEXT NOT NULL,
    correo TEXT,
    tipo_solicitud TEXT NOT NULL,
    asunto TEXT NOT NULL,
    descripcion_original TEXT NOT NULL,
    descripcion_formal TEXT NOT NULL,
    consecutivo_oficial TEXT,
    radicado_oficial TEXT,
    portal_message TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error_code TEXT,
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS request_status_events (
    id BIGSERIAL PRIMARY KEY,
    request_id BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    reason TEXT NOT NULL,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS request_attachments (
    id BIGSERIAL PRIMARY KEY,
    request_id BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    extension TEXT,
    size_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    sha256 TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS automation_jobs (
    id BIGSERIAL PRIMARY KEY,
    request_id BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    queue_name TEXT NOT NULL,
    job_state TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    scheduled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (request_id)
  )`,
];

for (const stmt of schemaStatements) {
  try {
    execFileSync('psql', [databaseUrl, '-c', stmt], { stdio: 'inherit' });
    console.log('OK:', stmt.slice(0, 60) + '...');
  } catch (err) {
    console.error('FAILED:', stmt.slice(0, 60) + '...');
    console.error(err.message);
    process.exit(1);
  }
}

console.log('\nMigration complete. All tables created.');
