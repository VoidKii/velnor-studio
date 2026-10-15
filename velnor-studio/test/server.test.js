'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../server');
const { generateDemoPack } = require('../lib/demo');
const { normalizePack, validateInput } = require('../lib/schema');
const { extractJson } = require('../lib/ai');

const GOOD = { idea: 'Why old film cameras are making a comeback', platform: 'TikTok', tone: 'Cinematic', language: 'English', duration: 30, variant: 0 };

function stop(server) { server.close(); if (server.closeAllConnections) server.closeAllConnections(); }

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}
const post = (base, body, headers = {}) => fetch(base + '/api/generate', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('demo generator returns a complete, valid pack for every duration and tone', () => {
  for (const duration of [15, 30, 45, 60, 90]) {
    for (const tone of ['Cinematic', 'Energetic', 'Educational', 'Funny', 'Emotional', 'Mysterious', 'Professional']) {
      const input = validateInput({ ...GOOD, duration, tone });
      const pack = generateDemoPack(input);
      assert.equal(pack.titles.length, 5);
      assert.ok(pack.hashtags.length >= 3);
      assert.match(pack.script[0].time, /^0:00-/);
      const last = pack.script[pack.script.length - 1].time.split('-')[1];
      const secs = Number(last.split(':')[0]) * 60 + Number(last.split(':')[1]);
      assert.equal(secs, duration, `script should end at ${duration}s for ${tone}`);
      // contiguous
      for (let i = 1; i < pack.script.length; i++) {
        assert.equal(pack.script[i].time.split('-')[0], pack.script[i - 1].time.split('-')[1]);
      }
    }
  }
});

test('regenerating with a different variant gives a different pack', () => {
  const a = generateDemoPack(validateInput({ ...GOOD, variant: 1 }));
  const b = generateDemoPack(validateInput({ ...GOOD, variant: 2 }));
  assert.notDeepEqual(a, b);
});

test('validateInput rejects bad input', () => {
  assert.throws(() => validateInput({ ...GOOD, idea: 'hi' }), /few words/);
  assert.throws(() => validateInput({ ...GOOD, platform: 'Myspace' }), /platform/);
  assert.throws(() => validateInput({ ...GOOD, duration: 7 }), /duration/);
  assert.throws(() => validateInput({ ...GOOD, idea: 'x'.repeat(801) }), /800/);
  assert.throws(() => validateInput(null), /JSON/);
});

test('normalizePack rejects incomplete packs and extractJson copes with fences', () => {
  assert.throws(() => normalizePack({ hook: 'x' }), /script/);
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here you go: {"a":2} thanks'), { a: 2 });
  assert.throws(() => extractJson('no json here'));
});

test('HTTP: status reports demo mode with no key, and never leaks key material', async () => {
  const server = createApp({});
  const base = await listen(server);
  const body = await (await fetch(base + '/api/status')).json();
  assert.equal(body.mode, 'demo');
  assert.equal(body.provider, null);
  assert.ok(body.options.platforms.includes('TikTok'));
  stop(server);
});

test('HTTP: generate works in demo mode and handles errors with clear messages', async () => {
  const server = createApp({});
  const base = await listen(server);
  let res = await post(base, GOOD);
  assert.equal(res.status, 200);
  let data = await res.json();
  assert.equal(data.mode, 'demo');
  assert.equal(data.pack.titles.length, 5);

  res = await post(base, { ...GOOD, idea: '' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /few words/);

  res = await post(base, '{not json');
  assert.equal(res.status, 400);

  res = await fetch(base + '/api/generate');
  assert.equal(res.status, 405);

  res = await post(base, 'x'.repeat(30000));
  assert.equal(res.status, 413);
  stop(server);
});

test('HTTP: static files served, traversal and missing paths blocked, CSP present', async () => {
  const server = createApp({});
  const base = await listen(server);
  let res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /VELNOR STUDIO/);
  assert.ok(res.headers.get('content-security-policy'));
  res = await fetch(base + '/app.js');
  assert.equal(res.status, 200);
  res = await fetch(base + '/nope.txt');
  assert.equal(res.status, 404);
  // raw request so the client does not normalise the dots away
  const status = await new Promise((resolve) => {
    const u = new URL(base);
    const r = http.request({ host: u.hostname, port: u.port, path: '/..%2Fserver.js', method: 'GET' }, (rr) => { rr.resume(); resolve(rr.statusCode); });
    r.end();
  });
  assert.ok([403, 404].includes(status), 'traversal must not return 200, got ' + status);
  const status2 = await new Promise((resolve) => {
    const u = new URL(base);
    const r = http.request({ host: u.hostname, port: u.port, path: '/../server.js', method: 'GET' }, (rr) => { rr.resume(); resolve(rr.statusCode); });
    r.end();
  });
  assert.ok([403, 404].includes(status2));
  const status3 = await new Promise((resolve) => {
    const u = new URL(base);
    const r = http.request({ host: u.hostname, port: u.port, path: '/.env', method: 'GET' }, (rr) => { rr.resume(); resolve(rr.statusCode); });
    r.end();
  });
  assert.equal(status3, 404);
  stop(server);
});

test('HTTP: access code is enforced when configured', async () => {
  const server = createApp({ ACCESS_CODE: 'open-sesame' });
  const base = await listen(server);
  assert.equal((await (await fetch(base + '/api/status')).json()).requiresAccessCode, true);
  let res = await post(base, GOOD);
  assert.equal(res.status, 401);
  res = await post(base, GOOD, { 'x-access-code': 'wrong' });
  assert.equal(res.status, 401);
  res = await post(base, GOOD, { 'x-access-code': 'open-sesame' });
  assert.equal(res.status, 200);
  stop(server);
});

test('HTTP: rate limit returns 429', async () => {
  const server = createApp({}, { rateLimit: { max: 3, windowMs: 60000 } });
  const base = await listen(server);
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await post(base, GOOD)).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  stop(server);
});

// ---- AI plumbing against a LOCAL MOCK of the provider (not the real API) ----
function mockProvider(handler) {
  const s = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c));
    req.on('end', () => handler(req, JSON.parse(b || '{}'), res));
  });
  return s;
}

test('AI path (mocked Anthropic): sends key server-side, parses reply, returns ai mode', async () => {
  const demo = generateDemoPack(validateInput(GOOD));
  let seen;
  const mock = mockProvider((req, body, res) => {
    seen = { headers: req.headers, body, url: req.url };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ content: [{ type: 'text', text: '```json\n' + JSON.stringify(demo) + '\n```' }] }));
  });
  const mockBase = await listen(mock);
  const server = createApp({ ANTHROPIC_API_KEY: 'sk-test-123', ANTHROPIC_BASE_URL: mockBase });
  const base = await listen(server);
  const status = await (await fetch(base + '/api/status')).json();
  assert.equal(status.mode, 'ai');
  assert.ok(!JSON.stringify(status).includes('sk-test-123'), 'status must not leak the key');
  const res = await post(base, GOOD);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.mode, 'ai');
  assert.ok(!JSON.stringify(data).includes('sk-test-123'));
  assert.equal(seen.url, '/v1/messages');
  assert.equal(seen.headers['x-api-key'], 'sk-test-123');
  assert.match(seen.body.messages[0].content, /Language: English/);
  stop(server); stop(mock);
});

test('AI path (mocked): provider errors and bad output become clear errors', async () => {
  let mode = '401';
  const mock = mockProvider((req, body, res) => {
    if (mode === '401') { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"bad key"}}'); }
    if (mode === '429') { res.writeHead(429); return res.end('{}'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ content: [{ type: 'text', text: 'Sorry, I cannot do that.' }] }));
  });
  const mockBase = await listen(mock);
  const server = createApp({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: mockBase });
  const base = await listen(server);
  let res = await post(base, GOOD);
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /rejected the API key/);
  mode = '429';
  res = await post(base, GOOD);
  assert.equal(res.status, 429);
  mode = 'junk';
  res = await post(base, GOOD);
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /expected format/);
  stop(server); stop(mock);
});

test('AI path (mocked OpenAI): uses bearer auth and chat completions', async () => {
  const demo = generateDemoPack(validateInput(GOOD));
  let seen;
  const mock = mockProvider((req, body, res) => {
    seen = { headers: req.headers, url: req.url };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(demo) } }] }));
  });
  const mockBase = await listen(mock);
  const server = createApp({ OPENAI_API_KEY: 'sk-openai', OPENAI_BASE_URL: mockBase });
  const base = await listen(server);
  const res = await post(base, GOOD);
  assert.equal(res.status, 200);
  assert.equal(seen.url, '/v1/chat/completions');
  assert.equal(seen.headers.authorization, 'Bearer sk-openai');
  stop(server); stop(mock);
});
