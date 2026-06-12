import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeText, validateBody, validateFiles } from './validation.js';
import { buildTrackingCode } from './services/request.service.js';
import { MAX_FILES, MAX_FILE_SIZE_BYTES } from './constants.js';

test('sanitizeText removes dangerous html/js payloads', () => {
  const value = '<img src=x onerror=alert(1)> javascript:alert(1) data:text/html,test';
  const sanitized = sanitizeText(value);

  assert.equal(sanitized.includes('<'), false);
  assert.equal(sanitized.includes('>'), false);
  assert.equal(/javascript:/i.test(sanitized), false);
  assert.equal(/onerror\s*=|onclick\s*=/i.test(sanitized), false);
  assert.equal(/data:/i.test(sanitized), false);
});

test('validateBody returns ok for a valid correo_electronico payload', () => {
  const result = validateBody({
    medioRespuesta: 'correo_electronico',
    correo: 'ana@example.com',
    tipoSolicitud: 'queja',
    asunto: 'Asunto suficientemente largo',
    descripcion: 'Descripcion con mas de veinte caracteres para pasar validacion.',
    aceptarTratamiento: true
  });

  assert.equal(result.ok, true);
});

test('validateBody rejects correo_electronico without correo', () => {
  const result = validateBody({
    medioRespuesta: 'correo_electronico',
    correo: '',
    tipoSolicitud: 'peticion',
    asunto: 'Asunto valido',
    descripcion: 'Descripcion con longitud minima superada para ser valida.',
    aceptarTratamiento: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].path, 'correo');
});

test('validateBody rejects aceptarTratamiento present but not true', () => {
  const result = validateBody({
    medioRespuesta: 'cartelera',
    tipoSolicitud: 'peticion',
    asunto: 'Asunto valido',
    descripcion: 'Descripcion con longitud minima.',
    aceptarTratamiento: false
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].path, 'aceptarTratamiento');
  assert.ok(result.errors[0].message.includes('true'));
});

test('validateBody rejects aceptarTratamiento absent', () => {
  const result = validateBody({
    medioRespuesta: 'cartelera',
    tipoSolicitud: 'peticion',
    asunto: 'Asunto valido',
    descripcion: 'Descripcion con longitud minima.'
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].path, 'aceptarTratamiento');
});

test('validateFiles rejects path traversal and invalid mime type', async () => {
  const result = await validateFiles([
    {
      originalname: '../malicioso.pdf',
      mimetype: 'application/x-msdownload',
      size: 1000
    }
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.errors.length >= 1, true);
});

test('validateFiles rejects more than MAX_FILES', async () => {
  const files = [];
  for (let i = 0; i < MAX_FILES + 1; i++) {
    files.push({
      originalname: `archivo${i}.pdf`,
      mimetype: 'application/pdf',
      size: 1000
    });
  }

  const result = await validateFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].path, 'files');
  assert.ok(result.errors[0].message.includes(String(MAX_FILES)));
});

test('validateFiles rejects files exceeding MAX_FILE_SIZE_BYTES', async () => {
  const files = [
    {
      originalname: 'archivo_grande.pdf',
      mimetype: 'application/pdf',
      size: MAX_FILE_SIZE_BYTES + 1
    }
  ];

  const result = await validateFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].path, 'files.0');
  assert.ok(result.errors[0].message.includes('27 MB'));
});

// ── Edge cases: empty/missing body ──

test('validateBody returns errors for empty input', () => {
  const result = validateBody({});
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0, 'Should have validation errors for empty body');
  assert.ok(result.errors.every(e => 'path' in e && 'message' in e), 'Each error must have path and message');
});

// ── Asunto boundary tests ──

test('validateBody rejects asunto with less than 5 characters', () => {
  const result = validateBody({
    medioRespuesta: 'cartelera',
    tipoSolicitud: 'peticion',
    asunto: 'abcd',
    descripcion: 'Descripcion con longitud suficiente para pasar el minimo.',
    aceptarTratamiento: true,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.path === 'asunto'));
});

test('validateBody accepts asunto with exactly 5 characters', () => {
  const result = validateBody({
    medioRespuesta: 'cartelera',
    tipoSolicitud: 'peticion',
    asunto: 'abcde',
    descripcion: 'Descripcion con longitud suficiente para pasar el minimo.',
    aceptarTratamiento: true,
  });

  assert.equal(result.ok, true);
});

// ── Descripcion boundary ──

test('validateBody rejects empty descripcion', () => {
  const result = validateBody({
    medioRespuesta: 'cartelera',
    tipoSolicitud: 'peticion',
    asunto: 'Asunto valido para prueba',
    descripcion: '',
    aceptarTratamiento: true,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.path === 'descripcion'));
});

// ── Email validation ──

test('validateBody rejects invalid email format when provided', () => {
  const result = validateBody({
    medioRespuesta: 'correo_electronico',
    correo: 'not-an-email',
    tipoSolicitud: 'peticion',
    asunto: 'Asunto valido para prueba',
    descripcion: 'Descripcion con contenido valido para superar el minimo.',
    aceptarTratamiento: true,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.path === 'correo'));
});

// ── Files edge cases ──

test('validateFiles returns ok for empty files array', async () => {
  const result = await validateFiles([]);
  assert.equal(result.ok, true);
});

test('validateFiles returns ok for exactly MAX_FILES files', async () => {
  const files = [];
  for (let i = 0; i < MAX_FILES; i++) {
    files.push({
      originalname: `archivo${i}.pdf`,
      mimetype: 'application/pdf',
      size: 1000,
    });
  }

  const result = await validateFiles(files);
  assert.equal(result.ok, true);
});

test('validateFiles handles null input gracefully', async () => {
  const result = await validateFiles(null);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].path === 'files');
});

test('validateFiles handles undefined input gracefully (defaults to [])', async () => {
  const result = await validateFiles(undefined);
  assert.equal(result.ok, true);
});

// ── Error contract: all errors must have path and message ──

test('all validation errors have path and message shape', () => {
  const result = validateBody({});
  assert.equal(result.ok, false);
  for (const error of result.errors) {
    assert.ok(typeof error.path === 'string', `error.path must be string, got ${typeof error.path}`);
    assert.ok(typeof error.message === 'string', `error.message must be string, got ${typeof error.message}`);
    assert.ok(error.path.length > 0, 'error.path must not be empty');
    assert.ok(error.message.length > 0, 'error.message must not be empty');
  }
});
