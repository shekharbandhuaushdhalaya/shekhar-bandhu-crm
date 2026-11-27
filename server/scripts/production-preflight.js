require('dotenv').config();
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'ALLOWED_ORIGINS', 'PUBLIC_FIRM_ID'];

function validateEnvironment(env = process.env) {
  const failures = [];
  const isProduction = env.NODE_ENV === 'production';

  for (const name of REQUIRED_ENV) {
    if (!String(env[name] || '').trim()) failures.push(`${name} is missing`);
  }

  const mongoUri = String(env.MONGODB_URI || '').trim();
  if (mongoUri) {
    try {
      const parsed = new URL(mongoUri);
      if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) {
        failures.push('MONGODB_URI must use mongodb:// or mongodb+srv://');
      }
      if (isProduction && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase())) {
        failures.push('MONGODB_URI points to localhost in production');
      }
    } catch (_) {
      failures.push('MONGODB_URI must be a valid MongoDB connection URI');
    }
  }

  if (isProduction) {
    const jwtSecret = String(env.JWT_SECRET || '');
    if (jwtSecret.length < 32) failures.push('JWT_SECRET must be at least 32 characters');
    if (jwtSecret.toLowerCase().includes('change-me') || jwtSecret.toLowerCase().includes('changeme')) {
      failures.push('JWT_SECRET still contains a placeholder value');
    }

    if (!/^[a-f0-9]{24}$/i.test(String(env.PUBLIC_FIRM_ID || ''))) {
      failures.push('PUBLIC_FIRM_ID must be a valid MongoDB ObjectId');
    }

    const rawOrigins = String(env.ALLOWED_ORIGINS || '');
    const origins = rawOrigins.split(',').map(value => value.trim()).filter(Boolean);
    const invalidOrigin = origin => {
      if (origin.includes('*')) return true;
      try {
        const parsed = new URL(origin);
        return parsed.protocol !== 'https:' ||
          !parsed.hostname ||
          Boolean(parsed.username || parsed.password) ||
          parsed.pathname !== '/' ||
          Boolean(parsed.search || parsed.hash);
      } catch (_) {
        return true;
      }
    };
    if (!origins.length || origins.some(invalidOrigin)) {
      failures.push('ALLOWED_ORIGINS must contain exact HTTPS origins only (no paths, credentials, query, hash or wildcards)');
    }
    if (String(env.ALLOW_MOCK_OTP || '').trim().toLowerCase() === 'true') {
      failures.push('ALLOW_MOCK_OTP must be false in production');
    }
  }

  return { isProduction, failures };
}

function runPreflight(env = process.env, logger = console) {
  const { isProduction, failures } = validateEnvironment(env);
  if (failures.length) {
    logger.error(`Production preflight failed:\\n- ${failures.join('\\n- ')}`);
    return false;
  }
  logger.log(`Production preflight passed (${isProduction ? 'production' : 'non-production'} mode).`);
  return true;
}

if (require.main === module && !runPreflight()) process.exit(1);

module.exports = { REQUIRED_ENV, validateEnvironment, runPreflight };
