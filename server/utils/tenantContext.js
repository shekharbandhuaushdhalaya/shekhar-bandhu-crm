const { AsyncLocalStorage } = require('async_hooks');
const storage = new AsyncLocalStorage();

function runWithTenant(context, fn) { return storage.run(context || {}, async () => await fn()); }
function getTenantContext() { return storage.getStore() || {}; }
function getFirmId() { return getTenantContext().firmId || null; }

module.exports = { runWithTenant, getTenantContext, getFirmId };
