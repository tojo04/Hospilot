import test from 'node:test';
import assert from 'node:assert/strict';
import { askHospilot } from '../src/ask.js';

function fakeClient(outputs, calls = []) {
  return {
    calls,
    responses: {
      async create(request) {
        calls.push(request);
        const output = outputs.shift();
        if (output === undefined) throw new Error('Unexpected model call');
        return { output_text: typeof output === 'string' ? output : JSON.stringify(output) };
      }
    }
  };
}

test('executes model-planned SQL and returns its visible evidence', async () => {
  const calls = [];
  const client = fakeClient([
    {
      answerable: true,
      reason: 'Beds include ward, status, and active state.',
      sql: "SELECT COUNT(*) AS available_icu_beds FROM beds WHERE ward = 'ICU' AND status = 'Available' AND is_active = 1",
      interpretation: 'Free means an active bed whose status is Available.'
    },
    'There are **6 active ICU beds available** right now.'
  ], calls);

  const result = await askHospilot('Any ICU beds free?', { client });
  assert.equal(result.answerable, true);
  assert.equal(result.rows[0].available_icu_beds, 6);
  assert.match(result.sql, /COUNT\(\*\)/);
  assert.match(result.answer, /6/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].text.format.type, 'json_schema');
  assert.equal(calls[0].text.format.strict, true);
});

test('honestly refuses information absent from the schema without executing SQL', async () => {
  const calls = [];
  const client = fakeClient([{
    answerable: false,
    reason: 'Patient satisfaction ratings and survey responses are not present in the database.',
    sql: '',
    interpretation: 'The requested metric requires satisfaction survey data.'
  }], calls);

  const result = await askHospilot('What is our patient satisfaction this month?', { client });
  assert.equal(result.answerable, false);
  assert.equal(result.sql, null);
  assert.deepEqual(result.rows, []);
  assert.match(result.answer, /not present/i);
  assert.equal(calls.length, 1);
});

test('repairs a failed SQL plan once before answering', async () => {
  const calls = [];
  const client = fakeClient([
    { answerable: true, reason: 'Available.', sql: 'SELECT mystery_column FROM beds', interpretation: 'Count beds.' },
    { answerable: true, reason: 'Available.', sql: "SELECT COUNT(*) AS count FROM beds WHERE status = 'Available' AND is_active = 1", interpretation: 'Count all available active beds.' },
    'There are **22 available active beds**.'
  ], calls);

  const result = await askHospilot('How many beds are open?', { client });
  assert.equal(result.rows[0].count, 22);
  assert.equal(calls.length, 3);
  assert.match(calls[1].input, /previous SQL attempt failed/i);
});

test('rejects empty and oversized questions before any model call', async () => {
  const client = fakeClient([]);
  await assert.rejects(() => askHospilot('   ', { client }), /enter a question/i);
  await assert.rejects(() => askHospilot('x'.repeat(1001), { client }), /1000/);
  assert.equal(client.calls.length, 0);
});
