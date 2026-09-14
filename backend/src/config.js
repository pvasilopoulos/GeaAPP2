import 'dotenv/config';

export const config = {
  pg: {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'spacehub',
    password: process.env.PGPASSWORD || 'spacehub',
    database: process.env.PGDATABASE || 'spacehub',
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
  },
  port: Number(process.env.PORT || 4000),
  seedCustomers: Number(process.env.SEED_CUSTOMERS || 350000),
};
