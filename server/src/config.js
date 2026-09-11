const isProduction = process.env.NODE_ENV === 'production';
function required(name) {
  const value = process.env[name];
  if (isProduction && !value) throw new Error(`${name} is required in production`);
  return value || '';
}
const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
module.exports = {
  isProduction,
  port: parseInt(process.env.PORT, 10) || 5000,
  mongoUri: required('MONGODB_URI') || 'mongodb://localhost:27017/shekhar-bandhu-crm',
  jwtSecret: required('JWT_SECRET'),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '30m',
  refreshTokenTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS, 10) || 30,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  cloudinary: { cloudName: process.env.CLOUDINARY_CLOUD_NAME || '', apiKey: process.env.CLOUDINARY_API_KEY || '', apiSecret: process.env.CLOUDINARY_API_SECRET || '' },
  allowedOrigins: origins.length ? origins : (isProduction ? [] : ['http://localhost:3000','http://localhost:8081','http://localhost:19006','https://shekhar-bandhu-crm.vercel.app']),
  trustProxy: process.env.TRUST_PROXY === 'true',
  enforceTenancy: process.env.ENFORCE_TENANCY !== 'false',
  workerPollMs: parseInt(process.env.WORKER_POLL_MS, 10) || 2000,
};
