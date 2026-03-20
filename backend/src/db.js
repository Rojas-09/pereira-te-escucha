import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;

dotenv.config();

const databaseUrl = process.env.DATABASE_URL || 'postgresql://pqrs_user:pqrs_pass@localhost:5432/pqrs_db';

if (!databaseUrl) {
  throw new Error('DATABASE_URL no esta configurada. Define la variable en .env');
}

export const pool = new Pool({
  connectionString: databaseUrl,
});

export async function query(text, params) {
  return pool.query(text, params);
}
