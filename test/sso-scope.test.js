const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const middleware = require('../middleware/sso-auth-middleware');
process.env.JWT_SECRET = 'test-only-shared-secret-'.repeat(3);
process.env.APP_ORIGIN = 'https://benefit.example.test';
process.env.SSO_REQUIRED_ROLE = 'leader';

function run({ role = 'admin', targetUrl = process.env.APP_ORIGIN, audience = process.env.APP_ORIGIN,
  issuer = 'https://wannav-main.onrender.com', type = 'sso' } = {}) {
  const token = jwt.sign({ role, targetUrl, type, userId: 1 }, process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '5m', audience, issuer });
  let status, passed = false, cookieSaved = false;
  const req = { path: '/api/status', query: {}, cookies: { wannav_sso: token } };
  const res = { status(value) { status = value; return this; }, json() {},
    clearCookie() {}, cookie() { cookieSaved = true; }, redirect() {} };
  middleware(req, res, () => { passed = true; });
  return { status, passed, cookieSaved };
}
test('admin/leader accepted, crew and unknown roles forbidden', () => {
  for (const role of ['admin', 'leader']) assert.equal(run({ role }).passed, true);
  for (const role of ['crew', 'invalid', 'constructor']) {
    assert.equal(run({ role }).status, 403);
    assert.equal(run({ role }).passed, false);
  }
});
test('wrong audience, issuer, target and token type rejected', () => {
  for (const claims of [
    { audience: 'https://other.example.test' }, { issuer: 'https://other.example.test' },
    { targetUrl: 'https://other.example.test' }, { targetUrl: 'http://benefit.example.test' },
    { type: 'session' }, { targetUrl: 'invalid' }
  ]) assert.equal(run(claims).status, 401);
});
test('default policy permits crew; invalid configuration fails closed', () => {
  delete process.env.SSO_REQUIRED_ROLE;
  assert.equal(run({ role: 'crew' }).passed, true);
  process.env.SSO_REQUIRED_ROLE = 'invalid';
  assert.equal(run().status, 401);
  process.env.SSO_REQUIRED_ROLE = 'crew';
  assert.equal(run({ role: 'crew' }).passed, true);
  process.env.SSO_REQUIRED_ROLE = 'leader';
});
