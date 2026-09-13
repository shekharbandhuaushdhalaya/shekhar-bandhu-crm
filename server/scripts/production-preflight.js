require('dotenv').config();
const crypto = require('crypto');

const failures = [];
const isProduction = process.env.NODE_ENV === 'production';
const required = ['MONGODB_URI', 'JWT_SECRET', 'ALLOWED_ORIGINS', 'PUBLIC_FIRM_ID'];
for (const name of required) if (!String(process.env[name] || '').trim()) failures.push(`${name} is missing`);
if (isProduction) {
  if (String(process.env.JWT_SECRET || '').length < 32) failures.push('JWT_SECRET must be at least 32 characters');
  if (!/^[a-f0-9]{24}$/i.test(String(process.env.PUBLIC_FIRM_ID || ''))) failures.push('PUBLIC_FIRM_ID must be a valid MongoDB ObjectId');
  const origins = String(process.env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  if (!origins.length || origins.includes('*') || origins.some(v => v.includes('*') || !/^https:\/\/[^/]+(?::\d+)?$/i.test(v))) failures.push('ALLOWED_ORIGINS must contain exact HTTPS origins only');
  if (/localhost|127\.0\.0\.1/i.test(String(process.env.MONGODB_URI || ''))) failures.push('MONGODB_URI points to localhost in production');
  if (String(process.env.ALLOW_MOCK_OTP || '').toLowerCase() === 'true') failures.push('ALLOW_MOCK_OTP must be false in production');
  if (String(process.env.JWT_SECRET || '').toLowerCase().includes('change-me')) failures.push('JWT_SECRET still contains a placeholder value');
}
if (!crypto.randomBytes(16).length) failures.push('Node crypto unavailable');
if (failures.length) {
  console.error(`Production preflight failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Production preflight passed (${isProduction ? 'production' : 'non-production'} mode).`);
