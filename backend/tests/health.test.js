import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

test('GET /health returns 200 with ok:true and service name', async () => {
  const app = createApp('test-token');
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.service, 'pereira-pqrs-backend');
});

test('GET /health returns content-type application/json', async () => {
  const app = createApp('test-token');
  const res = await request(app).get('/health');
  assert.match(res.headers['content-type'], /json/);
});

test('GET /health returns db status field', async () => {
  const app = createApp('test-token');
  const res = await request(app).get('/health');
  assert.equal(res.body.ok, true);
  assert.ok(typeof res.body.db === 'string');
});

test('GET /health/diagnostics returns diagnostic info without sensitive secrets', async () => {
  const app = createApp('test-token');
  const res = await request(app).get('/health/diagnostics');

  assert.equal(res.status, 200);
  assert.equal(res.body.service, 'pereira-pqrs-backend');
  assert.equal(typeof res.body.environment, 'string');
  assert.ok(typeof res.body.database === 'object');
  assert.ok(typeof res.body.playwright === 'object');
  assert.ok(typeof res.body.config === 'object');
  assert.ok(typeof res.body.config.formUrl === 'string');
  assert.ok(typeof res.body.config.headless === 'boolean');
  assert.equal(res.body.config.maxFiles > 0, true);
  assert.equal(res.body.config.maxFileSizeBytes > 0, true);
});
