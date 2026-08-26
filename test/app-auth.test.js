const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-shared-secret';
process.env.DASHBOARD_URL = 'https://dashboard.example.test';

const { app } = require('../src/index');

let server;
let baseUrl;

function createSsoToken() {
  return jwt.sign({
    type: 'sso',
    userId: 'test-user',
    username: 'tester',
    role: 'admin'
  }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
}

test.before(async () => {
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

test('ヘルスチェックは認証なしで利用できる', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
});

test('APIは認証なしの操作を拒否する', async () => {
  const response = await fetch(`${baseUrl}/api/run-batch`, {
    method: 'POST',
    redirect: 'manual'
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).success, false);
});

test('有効なSSO CookieではAPIを利用できる', async () => {
  const token = createSsoToken();

  const response = await fetch(`${baseUrl}/api/status`, {
    headers: { Cookie: `wannav_sso=${token}` }
  });
  assert.equal(response.status, 200);
  assert.equal(typeof (await response.json()).isProcessing, 'boolean');
});

test('許可されていない画像形式を拒否する', async () => {
  const form = new FormData();
  form.set('benefitRank', '10日達成');
  form.set('image', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], {
    type: 'image/svg+xml'
  }), 'test.svg');

  const response = await fetch(`${baseUrl}/api/upload-image`, {
    method: 'POST',
    headers: { Cookie: `wannav_sso=${createSsoToken()}` },
    body: form
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /画像ファイル/);
});
