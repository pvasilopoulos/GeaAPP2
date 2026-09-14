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
  seedCustomers: Number(process.env.SEED_CUSTOMERS || 350000),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};
