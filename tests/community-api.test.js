import test from 'node:test';
import assert from 'node:assert/strict';
import { communityErrorPayload, openApiDocument, publicApiError } from '../src/api/community.js';

const fixtureConfig = {
  sourceMode: 'local',
  sourceRepoUrl: '',
  sourceRef: 'fixture',
  sourceCommit: 'fixture-sha'
};

test('community API error objects include default English message metadata', () => {
  const payload = communityErrorPayload(new Error('Request body must be valid JSON.'), null, fixtureConfig);

  assert.equal(payload.error.message, 'Request body must be valid JSON.');
  assert.equal(payload.error.language, 'en');
  assert.equal(payload.error.direction, 'ltr');
});

test('community API error objects preserve explicit RTL message metadata', () => {
  const error = publicApiError(400, 'bad_request', 'تعذر تنفيذ الطلب.', { language: 'ar', direction: 'rtl' });
  const payload = communityErrorPayload(error, null, fixtureConfig);

  assert.equal(payload.error.code, 'bad_request');
  assert.equal(payload.error.message, 'تعذر تنفيذ الطلب.');
  assert.equal(payload.error.language, 'ar');
  assert.equal(payload.error.direction, 'rtl');
});

test('community OpenAPI contract documents error message metadata', () => {
  const schema = openApiDocument().components.schemas.ErrorResponse.properties.error;

  assert.deepEqual(schema.required, ['code', 'message', 'language', 'direction']);
  assert.equal(schema.properties.language.description, 'BCP 47 language tag for the error message text.');
  assert.deepEqual(schema.properties.direction.enum, ['ltr', 'rtl']);
});
