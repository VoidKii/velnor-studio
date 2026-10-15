'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

try { process.loadEnvFile(path.join(__dirname, '.env')); } catch (_) { /* no .env file: fine */ }

const { getConfig, generateWithAI, UpstreamError } = require('./lib/ai');
const { generateDemoPack } = require('./lib/demo');
const { validateInput, PLATFORMS, TONES, LANGUAGES, DURATIONS } = require('./lib/schema');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

function sha(value) { return crypto.createHash('sha256').update(String(value)).digest(); }

function createApp(env = process.env, options = {}) {
  const accessCode = (env.ACCESS_CODE || '').trim();
  const rateLimit = options.rateLimit || { max: 12, windowMs: 60_000 };
  const hits = new Map();

  function clientIp(req) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',').pop().trim();
    return req.socket.remoteAddress || 'unknown';
  }
  function limited(ip) {
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < rateLimit.windowMs);
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 5000) { for (const [k, v] of hits) if (!v.some((t) => now - t < rateLimit.windowMs)) hits.delete(k); }
    return recent.length > rateLimit.max;
  }

  function sendJson(res, status, obj, extra = {}) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
      ...SECURITY_HEADERS, ...extra });
    res.end(body);
  }

  function readBody(req, limit = 20_000) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > limit) {
          if (!chunks.tooBig) { chunks.tooBig = true; reject(Object.assign(new Error('Request too large.'), { status: 413 })); }
          return; // keep discarding; the response below closes the connection
        }
        chunks.push(c);
      });
      req.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); }
        catch (_) { reject(Object.assign(new Error('The request body was not valid JSON.'), { status: 400 })); }
      });
      req.on('error', reject);
    });
  }

  function status() {
    const cfg = getConfig(env);
    return {
      mode: cfg.provider ? 'ai' : 'demo',
      provider: cfg.provider,
      model: cfg.provider ? cfg.model : null,
      requiresAccessCode: Boolean(accessCode),
      options: { platforms: PLATFORMS, tones: TONES, languages: LANGUAGES, durations: DURATIONS },
    };
  }

  async function handleGenerate(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' }, { allow: 'POST' });
    if (accessCode) {
      const given = req.headers['x-access-code'] || '';
      if (!crypto.timingSafeEqual(sha(given), sha(accessCode))) {
        return sendJson(res, 401, { error: 'That access code is not right.', code: 'ACCESS_CODE' });
      }
    }
    if (limited(clientIp(req))) {
      return sendJson(res, 429, { error: 'Too many requests. Wait a minute and try again.' }, { 'retry-after': '60' });
    }
    try {
      const input = validateInput(await readBody(req));
      const cfg = getConfig(env);
      if (cfg.provider) {
        const pack = await generateWithAI(input, cfg, options.aiTimeoutMs);
        return sendJson(res, 200, { mode: 'ai', provider: cfg.provider, pack });
      }
      return sendJson(res, 200, { mode: 'demo', provider: null, pack: generateDemoPack(input) });
    } catch (err) {
      const statusCode = err.status || 500;
      if (statusCode >= 500 && !(err instanceof UpstreamError)) console.error('Generate failed:', err);
      return sendJson(res, statusCode, {
        error: statusCode === 500 ? 'Something went wrong on the server. Try again.' : err.message,
      }, statusCode === 413 ? { connection: 'close' } : {});
    }
  }

  function serveStatic(req, res, urlPath) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Not allowed.' });
    let rel;
    try { rel = decodeURIComponent(urlPath); } catch (_) { return sendJson(res, 400, { error: 'Bad path.' }); }
    if (rel.includes('\0')) return sendJson(res, 400, { error: 'Bad path.' });
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.join(PUBLIC_DIR, path.normalize(rel));
    if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'Forbidden.' });
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return sendJson(res, 404, { error: 'Not found.' });
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        'content-type': MIME[ext] || 'application/octet-stream',
        'content-length': st.size,
        'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
        ...SECURITY_HEADERS,
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  }

  return http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/api/status') return sendJson(res, 200, status());
    if (pathname === '/api/generate') return handleGenerate(req, res);
    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found.' });
    return serveStatic(req, res, pathname);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const server = createApp();
  server.listen(port, () => {
    const cfg = getConfig();
    console.log(`VELNOR STUDIO running on http://localhost:${port}`);
    console.log(cfg.provider
      ? `AI mode: ${cfg.provider} (${cfg.model})`
      : 'DEMO mode: no API key found, results come from templates, not AI.');
  });
}

module.exports = { createApp };
