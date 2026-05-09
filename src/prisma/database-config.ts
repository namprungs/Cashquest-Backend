import { PoolConfig } from 'pg';

export function createPostgresPoolOptions(
  connectionString: string,
  options: PoolConfig = {},
): PoolConfig {
  const sslOptions = getPostgresSslOptions(connectionString);

  return {
    connectionString: sslOptions
      ? stripSslMode(connectionString)
      : connectionString,
    ...options,
    ...(sslOptions ? { ssl: sslOptions } : {}),
  };
}

function getPostgresSslOptions(connectionString: string): PoolConfig['ssl'] {
  const rejectUnauthorizedEnv = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get('sslmode');
  const usesSsl =
    ['require', 'verify-ca', 'verify-full'].includes(sslMode || '') ||
    rejectUnauthorizedEnv !== undefined;

  if (!usesSsl) {
    return undefined;
  }

  return {
    rejectUnauthorized: rejectUnauthorizedEnv !== 'false',
  };
}

function stripSslMode(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  return url.toString();
}
