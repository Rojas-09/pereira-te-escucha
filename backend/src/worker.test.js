import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyAutomationError } from './worker.js';

test('classifyAutomationError detects portal timeouts', () => {
  const result = classifyAutomationError(new Error('page.goto: Timeout 30000ms exceeded'));

  assert.equal(result.category, 'portal_timeout');
  assert.equal(result.code, 'PORTAL_TIMEOUT');
});

test('classifyAutomationError detects portal response errors', () => {
  const result = classifyAutomationError(new Error('El portal rechazo la solicitud de radicacion'));

  assert.equal(result.category, 'portal_response_error');
  assert.equal(result.code, 'PORTAL_RESPONSE_ERROR');
});

test('classifyAutomationError falls back to unknown for generic failures', () => {
  const result = classifyAutomationError(new Error('unexpected failure'));

  assert.equal(result.category, 'unknown');
  assert.equal(result.code, 'UNKNOWN_AUTOMATION_ERROR');
});
