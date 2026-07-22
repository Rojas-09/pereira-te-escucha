const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(process.cwd(), '..');
const backendDir = process.cwd();
const dbUser = process.env.DB_USER || 'pqia';
const dbPassword = process.env.DB_PASSWORD || 'local_dev_password';
const dbName = 'pqrs_db';
const containerName = 'pqia-postgres';
const dbPort = '5432';
const databaseUrl = `postgresql://${dbUser}:${dbPassword}@localhost:${dbPort}/${dbName}`;

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

const run = (cmd, args, options = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...options });
const capture = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], ...options }).toString().trim();
const runPm = (cmd, args, options = {}) => {
  if (isWin) {
    const escaped = args
      .map((arg) => (/[\s"]/u.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg))
      .join(' ');
    return execSync(`${cmd} ${escaped}`, { stdio: 'inherit', shell: true, ...options });
  }

  return run(cmd, args, options);
};
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

try {
  execFileSync('docker', ['--version'], { stdio: 'ignore' });
} catch {
  throw new Error('Docker no esta disponible. Instala Docker Desktop y vuelve a intentar.');
}

runPm(npmCmd, ['install'], { cwd: repoRoot });
runPm(npmCmd, ['install'], { cwd: backendDir });
runPm(npxCmd, ['playwright', 'install', 'chromium'], { cwd: backendDir });

const envFile = path.join(backendDir, '.env');
const envExample = path.join(backendDir, '.env.example');
if (!fs.existsSync(envFile)) {
  fs.copyFileSync(envExample, envFile);
}

let envContent = fs.readFileSync(envFile, 'utf8');
if (/^DATABASE_URL=/m.test(envContent)) {
  envContent = envContent.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${databaseUrl}`);
} else {
  envContent = `${envContent.trimEnd()}\r\nDATABASE_URL=${databaseUrl}\r\n`;
}
fs.writeFileSync(envFile, envContent);

const existing = capture('docker', ['ps', '-a', '--filter', `name=^/${containerName}$`, '--format', '{{.Names}}']);
if (!existing) {
  run(
    'docker',
    ['run', '-d', '--name', containerName, '-e', `POSTGRES_USER=${dbUser}`, '-e', `POSTGRES_PASSWORD=${dbPassword}`, '-p', `${dbPort}:5432`, 'postgres:16-alpine'],
    { cwd: repoRoot }
  );
} else {
  const running = capture('docker', ['ps', '--filter', `name=^/${containerName}$`, '--format', '{{.Names}}']);
  if (!running) {
    run('docker', ['start', containerName], { cwd: repoRoot });
  }
}

let ready = false;
for (let attempt = 0; attempt < 25; attempt += 1) {
  try {
    run('docker', ['exec', containerName, 'pg_isready', '-U', dbUser, '-d', 'postgres'], { cwd: repoRoot });
    ready = true;
    break;
  } catch {
    sleep(2000);
  }
}

if (!ready) {
  throw new Error('PostgreSQL no respondio a tiempo. Revisa Docker Desktop e intenta de nuevo.');
}

const databaseExists = capture('docker', [
  'exec',
  containerName,
  'psql',
  '-U',
  dbUser,
  '-d',
  'postgres',
  '-tAc',
  `SELECT 1 FROM pg_database WHERE datname = '${dbName}';`,
]);

if (databaseExists !== '1') {
  run('docker', ['exec', containerName, 'psql', '-U', dbUser, '-d', 'postgres', '-c', `CREATE DATABASE ${dbName};`], {
    cwd: repoRoot,
  });
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS requests (id BIGSERIAL PRIMARY KEY, client_tracking_code TEXT NOT NULL UNIQUE, status TEXT NOT NULL, medio_respuesta TEXT NOT NULL, correo TEXT, tipo_solicitud TEXT NOT NULL, asunto TEXT NOT NULL, descripcion_original TEXT NOT NULL, descripcion_formal TEXT NOT NULL, consecutivo_oficial TEXT, radicado_oficial TEXT, portal_message TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error_code TEXT, last_error_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`,
  `CREATE TABLE IF NOT EXISTS request_status_events (id BIGSERIAL PRIMARY KEY, request_id BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE, from_status TEXT, to_status TEXT NOT NULL, reason TEXT NOT NULL, detail TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`,
  `CREATE TABLE IF NOT EXISTS request_attachments (id BIGSERIAL PRIMARY KEY, request_id BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, extension TEXT, size_bytes BIGINT NOT NULL, storage_path TEXT NOT NULL, sha256 TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`,
  `CREATE TABLE IF NOT EXISTS automation_jobs (id BIGSERIAL PRIMARY KEY, request_id BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE, queue_name TEXT NOT NULL, job_state TEXT NOT NULL, retry_count INTEGER NOT NULL DEFAULT 0, scheduled_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (request_id));`,
];

for (const statement of schemaStatements) {
  run('docker', ['exec', containerName, 'psql', '-U', dbUser, '-d', dbName, '-c', statement], { cwd: repoRoot });
}

console.log(`DATABASE_URL activo: ${databaseUrl.replace(/\/\/[^:]+:/, '//****:')}`);
