import dotenv from 'dotenv';
import path from 'path';
// cwd-independent: repo-root .env resolved from this file's location first,
// then a cwd-local .env fills any gaps (dotenv never overrides existing vars).
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    url: process.env.DATABASE_URL || 'postgresql://sitara:sitara_pass@localhost:5432/sitara_saas',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-jwt-secret-not-for-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-jwt-refresh-secret-not-for-production',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  storage: {
    endpoint: process.env.S3_ENDPOINT || '',
    region: process.env.S3_REGION || 'nbg1',
    bucket: process.env.S3_BUCKET || 'sitara-uploads',
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
  },

  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    from: process.env.MAIL_FROM || 'noreply@sitara.pk',
  },

  sentry: {
    dsn: process.env.SENTRY_DSN || '',
  },

  log: {
    level: process.env.LOG_LEVEL || 'debug',
    format: process.env.LOG_FORMAT || 'json',
  },
} as const;

export const isDev = config.nodeEnv === 'development';
export const isProd = config.nodeEnv === 'production';
