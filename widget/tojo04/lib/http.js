import { ConfigurationError } from './hospilot.js';

export function allowPostOnly(request, response) {
  if (request.method === 'POST') return true;
  response.setHeader('Allow', 'POST');
  sendJson(response, 405, { error: 'Method not allowed.' });
  return false;
}

export async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body);

  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 20_000) throw new TypeError('Request body is too large.');
  }
  return raw ? JSON.parse(raw) : {};
}

export function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

export function sendError(response, error) {
  if (error instanceof SyntaxError || error instanceof TypeError) {
    sendJson(response, 400, { error: error.message || 'Invalid request.' });
    return;
  }
  if (error instanceof ConfigurationError) {
    sendJson(response, 503, { error: error.message });
    return;
  }

  const statusCode = Number.isInteger(error.statusCode) && error.statusCode >= 400
    ? error.statusCode
    : 502;
  sendJson(response, statusCode, { error: error.message || 'Hospilot request failed.' });
}
