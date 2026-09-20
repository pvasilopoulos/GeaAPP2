import 'dotenv/config';

export const config = {
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'spacehub',
    password: process.env.MYSQL_PASSWORD || 'spacehub',
    database: process.env.MYSQL_DATABASE || 'spacehub',
    connectionLimit: Number(process.env.MYSQL_POOL_MAX || 10),
    // Numeric/decimal columns are returned as strings by default; the API
    // coerces where needed, keeping precision for currency values.
    charset: 'utf8mb4',
  },
  port: Number(process.env.PORT || 4000),
  // Public origin used to build absolute links (e.g. message attachments a
  // messaging provider must fetch over HTTPS). Falls back to the incoming
  // request's own origin when unset — set this in production behind a proxy
  // so links use the real public hostname instead of an internal one.
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  seedCustomers: Number(process.env.SEED_CUSTOMERS || 350000),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  connectorSecret: process.env.CONNECTOR_SECRET || process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  // Web Push (VAPID). Generate a pair once with `npx web-push generate-vapid-keys`
  // and set them as env vars in production — push is silently disabled without them.
  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:info@softify.gr',
  },
};
