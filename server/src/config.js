const isProduction = process.env.NODE_ENV === 'production';

function required(name) {
  const value = process.env[name];
  if (isProduction && !value) throw new Error(`${name} is required in production`);
  return value || '';
}

const defaultProdOrigins = [
  'https://shekhar-bandhu-crm.vercel.app',
  ...(process.env.RENDER_EXTERNAL_URL ? [process.env.RENDER_EXTERNAL_URL] : [])
];

const rawOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : (isProduction ? defaultProdOrigins : []);

const origins = rawOrigins
  .map(s => s.trim())
  .filter(Boolean);

function positiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

if (isProduction) {
  const jwtSecret = required('JWT_SECRET');
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production');
  if (origins.length === 0) throw new Error('ALLOWED_ORIGINS must contain at least one exact origin in production');
  if (origins.includes('*') || origins.some(origin => origin.includes('*'))) {
    throw new Error('Wildcard origins are not allowed in production');
  }
  if (origins.some(origin => !/^https:\/\/[^/]+(?::\d+)?$/i.test(origin))) {
    throw new Error('ALLOWED_ORIGINS must contain exact HTTPS origins in production');
  }
}

const allowedOrigins = origins.length ? origins : [
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:19006',
  'https://shekhar-bandhu-crm.vercel.app'
];

module.exports = {
  isProduction,
  port: positiveInt('PORT', 5000),
  mongoUri: required('MONGODB_URI') || 'mongodb://localhost:27017/shekhar-bandhu-crm',
  jwtSecret: required('JWT_SECRET'),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '30m',
  refreshTokenTtlDays: positiveInt('REFRESH_TOKEN_TTL_DAYS', 30),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  cloudinary: { cloudName: process.env.CLOUDINARY_CLOUD_NAME || '', apiKey: process.env.CLOUDINARY_API_KEY || '', apiSecret: process.env.CLOUDINARY_API_SECRET || '' },
  allowedOrigins,
  trustProxy: process.env.TRUST_PROXY === 'true',
  enforceTenancy: process.env.ENFORCE_TENANCY !== 'false',
  workerPollMs: positiveInt('WORKER_POLL_MS', 2000),
  isOriginAllowed(origin) {
    if (!origin) return true;
    if (allowedOrigins.includes('*')) return true;
    if (allowedOrigins.includes(origin)) return true;
    if (/\.vercel\.app$/i.test(origin)) return true;
    if (/\.onrender\.com$/i.test(origin)) return true;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
    for (const item of allowedOrigins) {
      if (typeof item === 'string' && item.startsWith('*.')) {
        const domain = item.slice(2).replace(/\./g, '\\.');
        const regex = new RegExp(`^https?:\\/\\/([^.]+\\.)*${domain}$`, 'i');
        if (regex.test(origin)) return true;
      }
    }
    return false;
  }
};
