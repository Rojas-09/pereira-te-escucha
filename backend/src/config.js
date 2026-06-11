import 'dotenv/config';

export const PORT = Number(process.env.PORT || 3001);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const BACKEND_API_TOKEN = process.env.BACKEND_API_TOKEN?.trim() || '';
export const PEREIRA_FORM_URL = process.env.PEREIRA_FORM_URL || 'https://doc.pereira.gov.co/ws/pqr/index.html';
export const WORKER_ENABLED = (process.env.WORKER_ENABLED || 'true').toLowerCase() !== 'false';
export const PLAYWRIGHT_HEADLESS = (process.env.PLAYWRIGHT_HEADLESS || 'true').toLowerCase() !== 'false';
export const PLAYWRIGHT_TIMEOUT_MS = Number(process.env.PLAYWRIGHT_TIMEOUT_MS || 30000);
export const MAX_FILES = Number(process.env.MAX_FILES || 10);
export const MAX_FILE_SIZE_BYTES = Number(process.env.MAX_FILE_SIZE_BYTES || 27 * 1024 * 1024);
