const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { gzipSync } = require('node:zlib');

test('Express parsers preserve compressed form/JSON handling and survive malformed compressed bodies', { timeout: 15000 }, async () => {
  // A dedicated process contains a possible decoder regression. No application,
  // credentials, database, cron job or notification client is loaded.
  const child = spawn(process.execPath, ['-e', `
    const express = require('express');
    const app = express();
    app.use(express.json({ limit: '100kb' }));
    app.use(express.urlencoded({ extended: true, limit: '100kb', parameterLimit: 100 }));
    app.post('/echo', (req, res) => res.json(req.body));
    app.get('/health', (req, res) => res.json({ ok: true }));
    app.use((error, req, res, next) => res.status(error.status || 500).json({ error: 'request rejected' }));
    const server = app.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
  `], { cwd: process.cwd(), env: { NODE_ENV: 'test' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  try {
    const [message] = await Promise.race([
      once(child, 'message'),
      once(child, 'exit').then(() => { throw new Error('Parser fixture failed to start'); })
    ]);
    const origin = `http://127.0.0.1:${message.port}`;
    const send = (body, type) => fetch(origin + '/echo', { method: 'POST',
      headers: { 'Content-Type': type, 'Content-Encoding': 'gzip' }, body,
      signal: AbortSignal.timeout(3000) });
    const normal = await send(gzipSync(Buffer.from('{"fixture":true}')), 'application/json');
    assert.equal(normal.status, 200);
    assert.deepEqual(await normal.json(), { fixture: true });
    const form = await send(gzipSync(Buffer.from('fixture=hello%20world&items%5B%5D=one&items%5B%5D=two')), 'application/x-www-form-urlencoded');
    assert.equal(form.status, 200);
    assert.deepEqual(await form.json(), { fixture: 'hello world', items: ['one', 'two'] });
    for (const [index, body] of [Buffer.from('invalid gzip fixture'), Buffer.concat([gzipSync(Buffer.from('{"fixture":true}')), Buffer.from([0xff, 0xff])])].entries()) {
      const response = await send(body, 'application/json');
      if (index === 0) assert.equal(response.status, 400);
      else assert.ok([200, 400].includes(response.status)); // Late decoder errors may follow a completed response.
      await response.arrayBuffer();
      const health = await fetch(origin + '/health', { signal: AbortSignal.timeout(3000) });
      assert.equal(health.status, 200);
      assert.equal(child.exitCode, null);
    }
  } finally {
    const exited = once(child, 'exit');
    child.kill();
    if (child.exitCode === null) await exited;
  }
});
