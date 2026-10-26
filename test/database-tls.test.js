const test = require('node:test');
const assert = require('node:assert/strict');
const pg = require('pg');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { join, dirname, resolve } = require('node:path');
const { getDatabaseConfig } = require('../src/db/connection-config');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

const url = 'postgresql://fixture:fixture-only@database.example/fixture';
function parameters(target, env) {
  // Real pg parsing, without connecting or sending credentials.
  return new pg.Client(getDatabaseConfig(target, env)).connectionParameters;
}

test('external DBs retain TLS certificate validation after pg parses URL flags', () => {
  for (const query of ['', '?sslmode=disable', '?sslmode=no-verify', '?ssl=false',
    '?ssl=0', '?sslmode=require&uselibpqcompat=true']) {
    const parsed = parameters(url + query, { RENDER: 'true' });
    assert.equal(parsed.ssl.rejectUnauthorized, true, query);
    assert.equal(parsed.ssl.checkServerIdentity, undefined, query);
    assert.equal(parsed.host, 'database.example');
  }
});

test('plaintext is limited to unconfigured TLS on non-production loopback development', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const target = url.replace('database.example', host);
    assert.equal(parameters(target, { NODE_ENV: 'development' }).ssl, false);
    assert.equal(parameters(target, { NODE_ENV: 'production' }).ssl.rejectUnauthorized, true);
    assert.equal(parameters(target, { RENDER: 'true' }).ssl.rejectUnauthorized, true);
    assert.equal(parameters(target + '?sslmode=disable', {}).ssl.rejectUnauthorized, true);
  }
  assert.equal(parameters(url, { NODE_ENV: 'development' }).ssl.rejectUnauthorized, true);
});

test('runtime and four maintenance entry points pass enforced options to pg without executing jobs', () => {
  const files = ['src/db/database.js', 'scripts/check-database.js', 'scripts/fix-missing-logs.js',
    'scripts/register-10day-completed.js', 'scripts/run-migration.js'];
  for (const file of files) {
    const source = readFileSync(join(__dirname, '..', file), 'utf8');
    const end = source.indexOf('const pool = new Pool(getDatabaseConfig(process.env.DATABASE_URL));');
    assert.ok(end >= 0, file);
    const setup = source.slice(0, end) + 'const pool = new Pool(getDatabaseConfig(process.env.DATABASE_URL));';
    for (const [host, expected] of [['database.example', true], ['dpg-fixture123-a', false]]) {
      const env = { DATABASE_URL: url.replace('database.example', host) + '?sslmode=disable', RENDER: 'true' };
      const configs = [];
      class Pool { constructor(config) { configs.push(new pg.Client(config).connectionParameters); } }
      runInNewContext(setup, { process: { env }, require(name) {
        if (name === 'pg') return { Pool };
        if (name === 'dotenv') return { config() {} };
        if (name.includes('connection-config')) return { getDatabaseConfig: target => getDatabaseConfig(target, env) };
        if (name.includes('validation')) return {};
        return require(name);
      } });
      assert.equal(configs.length, 1, file);
      assert.equal(configs[0].host, host, file);
      assert.equal(configs[0].ssl.rejectUnauthorized, expected, file);
    }
  }
});

test('CA and mTLS file settings survive without replacing strict verification', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.db-tls-fixture-'));
  try {
    const target = new URL(url);
    for (const [parameter, value] of [['sslrootcert', 'SYNTHETIC_CA'], ['sslcert', 'SYNTHETIC_CERT'], ['sslkey', 'SYNTHETIC_KEY']]) {
      const file = join(directory, parameter);
      await writeFile(file, value);
      target.searchParams.set(parameter, file);
    }
    target.searchParams.set('sslmode', 'no-verify');
    const parsed = parameters(target.toString(), {});
    assert.equal(parsed.ssl.ca, 'SYNTHETIC_CA');
    assert.equal(parsed.ssl.cert, 'SYNTHETIC_CERT');
    assert.equal(parsed.ssl.key, 'SYNTHETIC_KEY');
    assert.equal(parsed.ssl.rejectUnauthorized, true);
    assert.equal(parsed.ssl.checkServerIdentity, undefined);
    assert.throws(() => getDatabaseConfig(url + '?sslrootcert=not-a-real-file', {}), { message: 'Invalid PostgreSQL TLS certificate configuration' });
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(process.cwd()));
    await rm(directory, { recursive: true, force: true });
  }
});

test('only Render short internal Postgres names permit self-signed certificates', () => {
  const internal = 'postgresql://fixture:fixture-only@dpg-fixture123-a/fixture';
  assert.equal(parameters(internal, { RENDER: 'true' }).ssl.rejectUnauthorized, false);
  assert.equal(parameters(internal, { NODE_ENV: 'production' }).ssl.rejectUnauthorized, true);
  for (const host of ['dpg-fixture123-a.example', 'dpg-fixture123-a.render.com', 'localhost', '127.0.0.1', 'other-internal']) {
    assert.equal(parameters(url.replace('database.example', host), { RENDER: 'true' }).ssl.rejectUnauthorized, true, host);
  }
});

test('Render internal TLS cannot be disabled by URL parameters', () => {
  const parsed = parameters('postgresql://fixture:fixture-only@dpg-fixture123-a/fixture?sslmode=disable&ssl=0', { RENDER: 'true' });
  assert.equal(typeof parsed.ssl, 'object');
  assert.equal(parsed.ssl.rejectUnauthorized, false);
});

test('query target overrides, invalid URLs and global bypass fail without disclosing input', () => {
  for (const target of ['SYNTHETIC_SECRET', 'https://fixture:fixture-only@database.example/', url + '?host=other.example']) {
    assert.throws(() => getDatabaseConfig(target, {}), { message: 'Invalid PostgreSQL connection configuration' });
  }
  assert.throws(() => getDatabaseConfig(url, { NODE_TLS_REJECT_UNAUTHORIZED: '0' }), { message: 'Global TLS verification bypass is not supported' });
});

test('credentials, database, port and normal driver options remain intact', () => {
  const parsed = parameters('postgresql://fixture%40user:p%40ss%3Aword@database.example:5544/db%20name?application_name=fixture&connect_timeout=5', {});
  assert.equal(parsed.user, 'fixture@user');
  assert.equal(parsed.password, 'p@ss:word');
  assert.equal(parsed.database, 'db name');
  assert.equal(parsed.port, 5544);
  assert.equal(parsed.application_name, 'fixture');
  assert.equal(new URL(getDatabaseConfig('postgresql://database.example/fixture?connect_timeout=5', {}).connectionString).searchParams.get('connect_timeout'), '5');
});
