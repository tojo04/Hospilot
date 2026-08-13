import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCandidateGoal,
  createHospilotSession,
  getHospilotSessionStatus,
  isPipelineReady,
  isTerminalFailure
} from '../lib/hospilot.js';

test('prefixes every goal with the configured candidate name', () => {
  process.env.CANDIDATE_NAME = 'tojo04';
  assert.equal(
    buildCandidateGoal('Check ICU capacity tonight'),
    '[CANDIDATE-tojo04] Check ICU capacity tonight'
  );
});

test('replaces a manually entered candidate prefix instead of duplicating it', () => {
  process.env.CANDIDATE_NAME = 'tojo04';
  assert.equal(
    buildCandidateGoal('[CANDIDATE-someone] Check beds'),
    '[CANDIDATE-tojo04] Check beds'
  );
});

test('rejects an empty goal', () => {
  assert.throws(() => buildCandidateGoal('   '), /goal is required/i);
});

test('detects populated pipeline representations', () => {
  assert.equal(isPipelineReady([]), false);
  assert.equal(isPipelineReady({}), false);
  assert.equal(isPipelineReady('  '), false);
  assert.equal(isPipelineReady([{ id: 'one' }]), true);
  assert.equal(isPipelineReady({ nodes: [] }), true);
  assert.equal(isPipelineReady('planned'), true);
});

test('recognizes terminal failure statuses', () => {
  assert.equal(isTerminalFailure('failed'), true);
  assert.equal(isTerminalFailure('CANCELLED'), true);
  assert.equal(isTerminalFailure('planning'), false);
});

test('logs in and creates an explicitly non-autonomous prefixed session', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  process.env.HOSPILOT_USERNAME = 'sandbox-user';
  process.env.HOSPILOT_PASSWORD = 'sandbox-password';
  process.env.CANDIDATE_NAME = 'tojo04';

  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/auth/login')) {
      return Response.json({ token: 'header.payload.signature' });
    }
    return Response.json({ session_id: '11111111-2222-3333-4444-555555555555', status: 'planning' });
  };

  const result = await createHospilotSession('Check ICU capacity');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://hospilot.carer.ai/api/auth/login');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    username: 'sandbox-user',
    password: 'sandbox-password'
  });
  assert.equal(calls[1].url, 'https://hospilot.carer.ai/api/sessions');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer header.payload.signature');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    goal: '[CANDIDATE-tojo04] Check ICU capacity',
    constraints: '',
    autonomous: false
  });
  assert.equal(result.sessionId, '11111111-2222-3333-4444-555555555555');
});

test('polls a session and reports a populated pipeline without exposing it', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://hospilot.carer.ai/api/sessions/session-1234');
    assert.equal(options.headers.Authorization, 'Bearer token-that-is-long-enough');
    return Response.json({ status: 'planned', pipeline: [{ id: 'bed-agent' }] });
  };

  const result = await getHospilotSessionStatus('session-1234', 'token-that-is-long-enough');
  assert.deepEqual(result, {
    status: 'planned',
    pipelineReady: true,
    terminalFailure: false,
    error: null
  });
});
