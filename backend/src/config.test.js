import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAllowedOrigin } from './config.js';

test('resolveAllowedOrigin rejects wildcard values in production', () => {
  assert.throws(
    () => resolveAllowedOrigin({ NODE_ENV: 'production', ALLOWED_ORIGIN: '*' }),
    /ALLOWED_ORIGIN/
  );
});

test('resolveAllowedOrigin accepts an explicit origin in production', () => {
  const result = resolveAllowedOrigin({ NODE_ENV: 'production', ALLOWED_ORIGIN: 'https://app.example.com' });
  assert.equal(result, 'https://app.example.com');
});

test('resolveAllowedOrigin keeps wildcard in development by default', () => {
  const result = resolveAllowedOrigin({ NODE_ENV: 'development' });
  assert.equal(result, '*');
});
