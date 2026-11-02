import 'dotenv/config';

const required = ['PGHOST', 'PGDATABASE', 'PGUSER', 'JWT_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  port: Number(process.env.PORT) || 5000,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  db: {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: Number(process.env.PG_POOL_MAX) || 10,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,
  // Folder with the built React app (client/dist). When set, this server also
  // serves the website, so everything runs as one app (useful on cPanel).
  clientDist: process.env.CLIENT_DIST || '',
  uploads: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxBytes: (Number(process.env.MAX_UPLOAD_MB) || 5) * 1024 * 1024,
  },
};
