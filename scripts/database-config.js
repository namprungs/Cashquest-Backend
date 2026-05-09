function createPostgresPoolOptions(connectionString, options = {}) {
  const sslOptions = getPostgresSslOptions(connectionString);

  return {
    connectionString: sslOptions
      ? stripSslMode(connectionString)
      : connectionString,
    ...options,
    ...(sslOptions ? { ssl: sslOptions } : {}),
  };
}

function getPostgresSslOptions(connectionString) {
  const rejectUnauthorizedEnv = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get('sslmode');
  const usesSsl =
    ['require', 'verify-ca', 'verify-full'].includes(sslMode || '') ||
    rejectUnauthorizedEnv !== undefined;

  if (!usesSsl) {
    return null;
  }

  return {
    rejectUnauthorized: rejectUnauthorizedEnv !== 'false',
  };
}

function stripSslMode(connectionString) {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  return url.toString();
}

module.exports = { createPostgresPoolOptions };
