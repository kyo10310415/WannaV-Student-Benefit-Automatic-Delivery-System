const REQUIRED_VARIABLES = [
  'DATABASE_URL',
  'DISCORD_BOT_TOKEN',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'JWT_SECRET'
];

function validateEnvironment(env = process.env) {
  const missing = REQUIRED_VARIABLES.filter(name => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`必須環境変数が未設定です: ${missing.join(', ')}`);
  }

  try {
    JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch (error) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON は有効なJSONで指定してください');
  }

  if (env.ENABLE_CRON && !['true', 'false'].includes(env.ENABLE_CRON)) {
    throw new Error('ENABLE_CRON は true または false で指定してください');
  }

  if (env.NODE_ENV === 'production' && [
    'your-jwt-secret-key-here',
    'wannav-secret-key-change-in-production'
  ].includes(env.JWT_SECRET)) {
    throw new Error('JWT_SECRET を推測困難な本番用の値へ変更してください');
  }

  if (env.PORT) {
    const port = Number(env.PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('PORT は 1〜65535 の整数で指定してください');
    }
  }
}

module.exports = {
  validateEnvironment
};
