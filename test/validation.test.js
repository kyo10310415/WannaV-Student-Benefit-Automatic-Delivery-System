const test = require('node:test');
const assert = require('node:assert/strict');

const { parseMissionNo } = require('../src/utils/validation');
const { validateEnvironment } = require('../src/config/environment');

test('parseMissionNo は1〜3だけを受け付ける', () => {
  assert.equal(parseMissionNo('1'), 1);
  assert.equal(parseMissionNo(3), 3);
  assert.throws(() => parseMissionNo(0), /1〜3/);
  assert.throws(() => parseMissionNo('2foo'), /1〜3/);
  assert.throws(() => parseMissionNo(''), /1〜3/);
});

test('validateEnvironment は有効な設定を受け付ける', () => {
  assert.doesNotThrow(() => validateEnvironment({
    DATABASE_URL: 'postgresql://user:pass@example.com/database',
    DISCORD_BOT_TOKEN: 'token',
    GOOGLE_SERVICE_ACCOUNT_JSON: '{}',
    JWT_SECRET: 'shared-secret',
    ENABLE_CRON: 'false',
    PORT: '3000'
  }));
});

test('validateEnvironment は不足・不正な設定を拒否する', () => {
  assert.throws(() => validateEnvironment({}), /必須環境変数/);
  assert.throws(() => validateEnvironment({
    DATABASE_URL: 'postgresql://example',
    DISCORD_BOT_TOKEN: 'token',
    GOOGLE_SERVICE_ACCOUNT_JSON: 'not-json',
    JWT_SECRET: 'shared-secret'
  }), /有効なJSON/);

  assert.throws(() => validateEnvironment({
    DATABASE_URL: 'postgresql://example',
    DISCORD_BOT_TOKEN: 'token',
    GOOGLE_SERVICE_ACCOUNT_JSON: '{}',
    JWT_SECRET: 'your-jwt-secret-key-here',
    NODE_ENV: 'production'
  }), /本番用の値/);
});
