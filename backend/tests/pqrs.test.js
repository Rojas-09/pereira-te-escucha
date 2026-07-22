import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

const MOCK_TOKEN = 'test-token-123';
const MOCK_TRACKING = 'PETE-TEST-00000000000000-9999';

function makeMockServices() {
  const calls = { persist: [], query: [], cleanup: [] };

  const services = {
    buildTrackingCode: () => MOCK_TRACKING,
    persistReceivedRequest: async ({ trackingCode, payload, files }) => {
      calls.persist.push({ trackingCode, payload, filesCount: files.length });
      return 100;
    },
    cleanupFiles: async (files) => {
      calls.cleanup.push(files.length);
    },
    queryTrackingStatus: async (trackingCode) => {
      calls.query.push(trackingCode);
      if (trackingCode === MOCK_TRACKING) {
        return { requestId: 100, trackingCode: MOCK_TRACKING, status: 'recibido', events: [] };
      }
      return null;
    },
  };

  return { services, calls };
}

test('GET / returns service info', async () => {
  const app = createApp(MOCK_TOKEN);
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.service, 'pereira-pqrs-backend');
  assert.equal(res.body.hint, 'Usa /health o /api/pqrs/*');
});

test('GET /api/pqrs/status/:trackingCode returns 401 without auth', async () => {
  const { services } = makeMockServices();
  const app = createApp(MOCK_TOKEN, { pqrsServices: services });
  const res = await request(app).get(`/api/pqrs/status/${MOCK_TRACKING}`);
  assert.equal(res.status, 401);
  assert.equal(res.body.code, 'UNAUTHORIZED');
});

test('GET /api/pqrs/status/:trackingCode returns tracking data with auth', async () => {
  const { services, calls } = makeMockServices();
  const app = createApp(MOCK_TOKEN, { pqrsServices: services });
  const res = await request(app)
    .get(`/api/pqrs/status/${MOCK_TRACKING}`)
    .set('Authorization', `Bearer ${MOCK_TOKEN}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.trackingCode, MOCK_TRACKING);
  assert.equal(calls.query.length, 1);
});

test('GET /api/pqrs/status/:trackingCode returns 404 for unknown code', async () => {
  const { services } = makeMockServices();
  const app = createApp(MOCK_TOKEN, { pqrsServices: services });
  const res = await request(app)
    .get('/api/pqrs/status/UNKNOWN-CODE')
    .set('Authorization', `Bearer ${MOCK_TOKEN}`);
  assert.equal(res.status, 404);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, 'NOT_FOUND');
});

test('GET /api/pqrs/status/ returns 404 (no route match)', async () => {
  const { services } = makeMockServices();
  const app = createApp(MOCK_TOKEN, { pqrsServices: services });
  const res = await request(app)
    .get('/api/pqrs/status/')
    .set('Authorization', `Bearer ${MOCK_TOKEN}`);
  assert.equal(res.status, 404);
});

test('GET /api/pqrs/status/:trackingCode returns 500 on service error', async () => {
  const errorServices = {
    buildTrackingCode: () => MOCK_TRACKING,
    persistReceivedRequest: async () => 100,
    cleanupFiles: async () => {},
    queryTrackingStatus: async () => { throw new Error('DB connection refused'); },
  };
  const app = createApp(MOCK_TOKEN, { pqrsServices: errorServices });
  const res = await request(app)
    .get(`/api/pqrs/status/${MOCK_TRACKING}`)
    .set('Authorization', `Bearer ${MOCK_TOKEN}`);
  assert.equal(res.status, 500);
  assert.equal(res.body.code, 'DATABASE_READ_FAILED');
  assert.equal(typeof res.body.message, 'string');
});

test('POST /api/pqrs/submit-anonymous with valid JSON body returns 202', async () => {
  const { services, calls } = makeMockServices();
  const app = createApp(MOCK_TOKEN, { pqrsServices: services });

  const res = await request(app)
    .post('/api/pqrs/submit-anonymous')
    .set('Authorization', `Bearer ${MOCK_TOKEN}`)
    .field('medioRespuesta', 'cartelera')
    .field('tipoSolicitud', 'peticion')
    .field('asunto', 'Solicitud de prueba con asunto largo')
    .field('descripcion', 'Descripcion detallada de la solicitud de prueba para validar.')
    .field('aceptarTratamiento', 'true');

  assert.equal(res.status, 202);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.code, 'ACCEPTED');
  assert.equal(res.body.data.trackingCode, MOCK_TRACKING);
  assert.equal(res.body.data.requestId, 100);
  assert.equal(calls.persist.length, 1);
  assert.equal(calls.persist[0].trackingCode, MOCK_TRACKING);
  assert.equal(calls.persist[0].payload.asunto, 'Solicitud de prueba con asunto largo');
});

test('POST /api/pqrs/submit-anonymous without aceptarTratamiento returns 400', async () => {
  const { services } = makeMockServices();
  const app = createApp(MOCK_TOKEN, { pqrsServices: services });

  const res = await request(app)
    .post('/api/pqrs/submit-anonymous')
    .set('Authorization', `Bearer ${MOCK_TOKEN}`)
    .field('medioRespuesta', 'cartelera')
    .field('tipoSolicitud', 'peticion')
    .field('asunto', 'Solicitud de prueba valida')
    .field('descripcion', 'Descripcion detallada de la solicitud de prueba.');

  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, 'VALIDATION_ERROR');
  assert.ok(res.body.errors.some(e => e.path === 'aceptarTratamiento'));
});

test('POST /api/pqrs/submit-anonymous with invalid body returns 400', async () => {
  const { services } = makeMockServices();
  const app = createApp(MOCK_TOKEN, { pqrsServices: services });

  const res = await request(app)
    .post('/api/pqrs/submit-anonymous')
    .set('Authorization', `Bearer ${MOCK_TOKEN}`)
    .field('medioRespuesta', 'cartelera')
    .field('tipoSolicitud', 'peticion')
    .field('asunto', 'abc')
    .field('descripcion', '')
    .field('aceptarTratamiento', 'true');

  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'VALIDATION_ERROR');
  assert.ok(res.body.errors.length >= 1);
});

test('POST /api/pqrs/submit-anonymous returns 500 when persist fails', async () => {
  const errorServices = {
    buildTrackingCode: () => MOCK_TRACKING,
    persistReceivedRequest: async () => { throw new Error('DB insert failed'); },
    cleanupFiles: async () => {},
    queryTrackingStatus: async () => null,
  };
  const app = createApp(MOCK_TOKEN, { pqrsServices: errorServices });

  const res = await request(app)
    .post('/api/pqrs/submit-anonymous')
    .set('Authorization', `Bearer ${MOCK_TOKEN}`)
    .field('medioRespuesta', 'cartelera')
    .field('tipoSolicitud', 'queja')
    .field('asunto', 'Error de prueba con asunto largo')
    .field('descripcion', 'Descripcion detallada de la solicitud de prueba.')
    .field('aceptarTratamiento', 'true');

  assert.equal(res.status, 500);
  assert.equal(res.body.code, 'DATABASE_WRITE_FAILED');
  assert.equal(typeof res.body.message, 'string');
});
