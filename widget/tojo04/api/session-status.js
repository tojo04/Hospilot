import { getHospilotSessionStatus } from '../lib/hospilot.js';
import { allowPostOnly, readBody, sendError, sendJson } from '../lib/http.js';

export default async function handler(request, response) {
  if (!allowPostOnly(request, response)) return;

  try {
    const { sessionId, token } = await readBody(request);
    const status = await getHospilotSessionStatus(sessionId, token);
    sendJson(response, 200, status);
  } catch (error) {
    sendError(response, error);
  }
}
