const path = require('path');
const { spawnSync } = require('child_process');

const serverDir = path.resolve(__dirname, '..');
const validEnv = {
  ...process.env,
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/ci',
  JWT_SECRET: 'this-is-a-production-length-jwt-secret-123456789',
  PUBLIC_FIRM_ID: '64f000000000000000000001',
  ALLOWED_ORIGINS: 'https://crm.example.com,https://shop.example.com'
};

function runConfig(env, code = "require('./src/config')") {
  return spawnSync(process.execPath, ['-e', code], {
    cwd: serverDir,
    env,
    encoding: 'utf8'
  });
}

describe('Production configuration hardening', () => {
  it('uses exact-match CORS only in production', () => {
    const result = runConfig(validEnv, `
      const config = require('./src/config');
      process.stdout.write(JSON.stringify({
        exact: config.isOriginAllowed('https://crm.example.com'),
        shop: config.isOriginAllowed('https://shop.example.com'),
        preview: config.isOriginAllowed('https://random-preview.vercel.app'),
        render: config.isOriginAllowed('https://random-service.onrender.com'),
        localhost: config.isOriginAllowed('http://localhost:3000'),
        noOrigin: config.isOriginAllowed(undefined)
      }));
    `);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      exact: true,
      shop: true,
      preview: false,
      render: false,
      localhost: false,
      noOrigin: true
    });
  });

  it('fails startup when ALLOWED_ORIGINS is missing in production', () => {
    const env = { ...validEnv };
    delete env.ALLOWED_ORIGINS;
    const result = runConfig(env);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ALLOWED_ORIGINS must contain at least one exact origin in production');
  });

  it('allows startup when PUBLIC_FIRM_ID is omitted in production', () => {
    const env = { ...validEnv };
    delete env.PUBLIC_FIRM_ID;
    const result = runConfig(env);
    expect(result.status).toBe(0);
  });

  it('fails startup when PUBLIC_FIRM_ID is not a MongoDB ObjectId', () => {
    const result = runConfig({ ...validEnv, PUBLIC_FIRM_ID: 'not-an-object-id' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PUBLIC_FIRM_ID must be a valid 24-character MongoDB ObjectId in production');
  });
});
