const HOSPILOT_BASE_URL = 'https://hospilot.carer.ai';
const DEFAULT_CANDIDATE_NAME = 'tojo04';
const REQUEST_TIMEOUT_MS = 20_000;

export class ConfigurationError extends Error {}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigurationError(`${name} is not configured on the server.`);
  return value;
}

function candidateName() {
  const value = (process.env.CANDIDATE_NAME || DEFAULT_CANDIDATE_NAME).trim();
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(value)) {
    throw new ConfigurationError('CANDIDATE_NAME must contain only letters, numbers, hyphens, or underscores.');
  }
  return value;
}

async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${HOSPILOT_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    if (error.name === 'TimeoutError') throw new Error('Hospilot did not respond in time.');
    throw new Error('Could not connect to Hospilot.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body.detail === 'string'
      ? body.detail
      : typeof body.message === 'string'
        ? body.message
        : `Hospilot returned HTTP ${response.status}.`;
    const error = new Error(detail);
    error.statusCode = response.status;
    throw error;
  }
  return body;
}

export function buildCandidateGoal(rawGoal) {
  if (typeof rawGoal !== 'string') throw new TypeError('A goal is required.');
  const trimmed = rawGoal.trim();
  if (!trimmed) throw new TypeError('A goal is required.');
  if (trimmed.length > 1000) throw new TypeError('The goal must be 1000 characters or fewer.');

  const withoutExistingPrefix = trimmed.replace(/^\[CANDIDATE-[^\]]+\]\s*/i, '');
  if (!withoutExistingPrefix) throw new TypeError('Please enter a goal after the candidate prefix.');
  return `[CANDIDATE-${candidateName()}] ${withoutExistingPrefix}`;
}

export function isPipelineReady(pipeline) {
  if (Array.isArray(pipeline)) return pipeline.length > 0;
  if (pipeline && typeof pipeline === 'object') return Object.keys(pipeline).length > 0;
  if (typeof pipeline === 'string') return pipeline.trim().length > 0;
  return false;
}

export function isTerminalFailure(status) {
  return ['failed', 'error', 'cancelled', 'canceled'].includes(String(status || '').toLowerCase());
}

export async function createHospilotSession(rawGoal) {
  const username = requiredEnvironment('HOSPILOT_USERNAME');
  const password = requiredEnvironment('HOSPILOT_PASSWORD');
  const goal = buildCandidateGoal(rawGoal);

  const login = await requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  if (!login.token) throw new Error('Hospilot login succeeded without returning a token.');

  const session = await requestJson('/api/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ goal, constraints: '', autonomous: false })
  });
  if (!session.session_id) throw new Error('Hospilot did not return a session ID.');

  return {
    token: login.token,
    sessionId: session.session_id,
    status: session.status || 'planning',
    goal
  };
}

export async function getHospilotSessionStatus(sessionId, token) {
  if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(sessionId)) {
    throw new TypeError('A valid session ID is required.');
  }
  if (typeof token !== 'string' || token.length < 20 || token.length > 10_000) {
    throw new TypeError('A valid Hospilot token is required.');
  }

  const session = await requestJson(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });

  return {
    status: session.status || 'planning',
    pipelineReady: isPipelineReady(session.pipeline),
    terminalFailure: isTerminalFailure(session.status),
    error: session.error || null
  };
}
