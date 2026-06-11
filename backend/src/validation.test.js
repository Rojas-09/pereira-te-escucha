import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeText, validateBody, validateFiles, buildTrackingCode } from './validation.js';
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

test('validateFiles rejects path traversal and invalid mime type', () => {
  const result = validateFiles([
    {
      originalname: '../malicioso.pdf',
      mimetype: 'application/x-msdownload',
      size: 1000
    }
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.errors.length >= 1, true);
});

test('validateFiles rejects more than MAX_FILES', () => {
  const files = [];
  for (let i = 0; i < MAX_FILES + 1; i++) {
    files.push({
      originalname: `archivo${i}.pdf`,
      mimetype: 'application/pdf',
      size: 1000
    });
  }

  const result = validateFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].path, 'files');
  assert.ok(result.errors[0].message.includes(String(MAX_FILES)));
});

test('validateFiles rejects files exceeding MAX_FILE_SIZE_BYTES', () => {
  const files = [
    {
      originalname: 'archivo_grande.pdf',
      mimetype: 'application/pdf',
      size: MAX_FILE_SIZE_BYTES + 1
    }
  ];

  const result = validateFiles(files);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].path, 'files.0');
  assert.ok(result.errors[0].message.includes('27 MB'));
});
