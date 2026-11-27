const { validateEnvironment, runPreflight } = require('../scripts/production-preflight');

const validProduction = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb+srv://user:password@cluster.example.mongodb.net/app',
  JWT_SECRET: 'a'.repeat(40),
  ALLOWED_ORIGINS: 'https://crm.example.com,https://admin.example.com:8443',
  PUBLIC_FIRM_ID: '507f1f77bcf86cd799439011',
  ALLOW_MOCK_OTP: 'false'
};

describe('production preflight validation', () => {
  test('accepts a valid production configuration', () => {
    expect(validateEnvironment(validProduction).failures).toEqual([]);
  });

  test('requires all baseline environment variables', () => {
    const result = validateEnvironment({ NODE_ENV: 'development' });
    expect(result.failures).toEqual(expect.arrayContaining([
      'MONGODB_URI is missing',
      'JWT_SECRET is missing',
      'ALLOWED_ORIGINS is missing',
      'PUBLIC_FIRM_ID is missing'
    ]));
  });

  test('rejects malformed or non-MongoDB connection URIs', () => {
    expect(validateEnvironment({ ...validProduction, MONGODB_URI: 'https://db.example.com' }).failures)
      .toContain('MONGODB_URI must use mongodb:// or mongodb+srv://');
    expect(validateEnvironment({ ...validProduction, MONGODB_URI: 'not a uri' }).failures)
      .toContain('MONGODB_URI must be a valid MongoDB connection URI');
  });

  test('rejects local MongoDB endpoints in production', () => {
    expect(validateEnvironment({ ...validProduction, MONGODB_URI: 'mongodb://localhost:27017/app' }).failures)
      .toContain('MONGODB_URI points to localhost in production');
    expect(validateEnvironment({ ...validProduction, MONGODB_URI: 'mongodb://127.0.0.1:27017/app' }).failures)
      .toContain('MONGODB_URI points to localhost in production');
  });

  test('rejects short and placeholder JWT secrets', () => {
    const short = validateEnvironment({ ...validProduction, JWT_SECRET: 'short' }).failures;
    expect(short).toContain('JWT_SECRET must be at least 32 characters');
    const placeholder = validateEnvironment({ ...validProduction, JWT_SECRET: 'change-me-' + 'x'.repeat(40) }).failures;
    expect(placeholder).toContain('JWT_SECRET still contains a placeholder value');
  });

  test('rejects invalid public firm IDs', () => {
    expect(validateEnvironment({ ...validProduction, PUBLIC_FIRM_ID: 'not-an-object-id' }).failures)
      .toContain('PUBLIC_FIRM_ID must be a valid MongoDB ObjectId');
  });

  test.each([
    '*',
    'https://*.example.com',
    'http://crm.example.com',
    'https://crm.example.com/path',
    'https://user:pass@crm.example.com',
    'https://crm.example.com?debug=true',
    'not-a-url'
  ])('rejects unsafe production origin %s', origin => {
    expect(validateEnvironment({ ...validProduction, ALLOWED_ORIGINS: origin }).failures)
      .toContain('ALLOWED_ORIGINS must contain exact HTTPS origins only (no paths, credentials, query, hash or wildcards)');
  });

  test('rejects mock OTP when enabled in production', () => {
    expect(validateEnvironment({ ...validProduction, ALLOW_MOCK_OTP: 'TRUE' }).failures)
      .toContain('ALLOW_MOCK_OTP must be false in production');
  });

  test('keeps non-production mode compatible while still requiring baseline values', () => {
    const result = validateEnvironment({
      NODE_ENV: 'development',
      MONGODB_URI: 'mongodb://localhost:27017/app',
      JWT_SECRET: 'short',
      ALLOWED_ORIGINS: 'http://localhost:3000',
      PUBLIC_FIRM_ID: 'not-an-object-id'
    });
    expect(result.failures).toEqual([]);
  });

  test('returns false and reports errors without exiting the process', () => {
    const logger = { error: jest.fn(), log: jest.fn() };
    expect(runPreflight({ NODE_ENV: 'production' }, logger)).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.log).not.toHaveBeenCalled();
  });
});
