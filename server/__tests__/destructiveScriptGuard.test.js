const { assertDestructiveScriptAllowed } = require('../scripts/destructive-script-guard');

describe('destructive data script guard', () => {
  test('requires an explicit confirmation in non-production environments', () => {
    expect(() => assertDestructiveScriptAllowed({ NODE_ENV: 'development' }, 'clear-data'))
      .toThrow('requires ALLOW_DESTRUCTIVE_DATA_SCRIPT=YES');
  });

  test('allows execution only after explicit confirmation outside production', () => {
    expect(() => assertDestructiveScriptAllowed({
      NODE_ENV: 'development',
      ALLOW_DESTRUCTIVE_DATA_SCRIPT: 'YES'
    }, 'clear-data')).not.toThrow();
  });

  test('always blocks destructive data scripts in production', () => {
    expect(() => assertDestructiveScriptAllowed({
      NODE_ENV: 'production',
      ALLOW_DESTRUCTIVE_DATA_SCRIPT: 'YES'
    }, 'delete-seed-data')).toThrow('disabled in production');
  });

  test('requires the exact confirmation value', () => {
    expect(() => assertDestructiveScriptAllowed({
      NODE_ENV: 'test',
      ALLOW_DESTRUCTIVE_DATA_SCRIPT: 'yes'
    })).toThrow('requires ALLOW_DESTRUCTIVE_DATA_SCRIPT=YES');
  });
});
