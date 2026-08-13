import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import createSession from './api/create-session.js';
import sessionStatus from './api/session-status.js';

const indexPath = fileURLToPath(new URL('./index.html', import.meta.url));
const port = Number(process.env.PORT || 3000);

function serveIndex(response) {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  createReadStream(indexPath).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/api/create-session') return createSession(request, response);
  if (url.pathname === '/api/session-status') return sessionStatus(request, response);
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return serveIndex(response);
  }

  response.statusCode = 404;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end('Not found');
});

await stat(indexPath);
server.listen(port, () => {
  console.log(`Hospilot widget available at http://localhost:${port}`);
});
