function assertDestructiveScriptAllowed(env = process.env, scriptName = 'Destructive data script') {
  if (env.NODE_ENV === 'production') {
    throw new Error(`${scriptName} is disabled in production.`);
  }
  if (env.ALLOW_DESTRUCTIVE_DATA_SCRIPT !== 'YES') {
    throw new Error(`${scriptName} requires ALLOW_DESTRUCTIVE_DATA_SCRIPT=YES.`);
  }
}

module.exports = { assertDestructiveScriptAllowed };
