import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { askHospilot } from './ask.js';
import { databasePath, getDatasetSummary } from './database.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staticRoot = resolve(root, 'static');
const port = Number(process.env.PORT || 3001);

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml'
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 20_000) throw new TypeError('Request body is too large.');
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new TypeError('Request body must be valid JSON.');
  }
}

async function serveStatic(pathname, response) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = resolve(staticRoot, relative);
  if (!filePath.startsWith(`${staticRoot}${sep}`) && filePath !== staticRoot) return false;
  try {
    const details = await stat(filePath);
    if (!details.isFile()) return false;
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': extname(filePath) === '.html' ? 'no-store' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    });
    createReadStream(filePath).pipe(response);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/api/health') {
    try {
      sendJson(response, 200, {
        ok: true,
        databaseReady: existsSync(databasePath),
        apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        dataset: getDatasetSummary()
      });
    } catch (error) {
      sendJson(response, 503, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === '/api/ask') {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      sendJson(response, 405, { error: 'Method not allowed.' });
      return;
    }
    try {
      const { question } = await readJson(request);
      const result = await askHospilot(question);
      sendJson(response, 200, result);
    } catch (error) {
      const clientError = error instanceof TypeError;
      const configurationError = /OPENAI_API_KEY|Database not initialized/.test(error.message);
      sendJson(response, clientError ? 400 : configurationError ? 503 : 502, {
        error: error.message || 'The question could not be processed.'
      });
    }
    return;
  }

  if (request.method === 'GET' && await serveStatic(url.pathname, response)) return;
  sendJson(response, 404, { error: 'Not found.' });
});

server.listen(port, () => {
  console.log(`Ask Hospilot available at http://localhost:${port}`);
  if (!existsSync(databasePath)) console.warn('Database missing: run npm run db:seed');
  if (!process.env.OPENAI_API_KEY) console.warn('OPENAI_API_KEY is not configured.');
});
