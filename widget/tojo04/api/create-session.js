import { createHospilotSession } from '../lib/hospilot.js';
import { allowPostOnly, readBody, sendError, sendJson } from '../lib/http.js';

export default async function handler(request, response) {
  if (!allowPostOnly(request, response)) return;

  try {
    const { goal } = await readBody(request);
    const session = await createHospilotSession(goal);
    sendJson(response, 201, session);
  } catch (error) {
    sendError(response, error);
  }
}
