const mongoose = require('mongoose');
const { getFirmId } = require('./tenantContext');

/**
 * Adds tenant ownership and enforces the active tenant across query/document writes.
 * Models using this plugin must never be queried outside a tenant context unless the
 * caller is an explicit migration/bootstrap script operating on the raw collection.
 */
module.exports = function tenantPlugin(schema) {
  if (!schema.path('firmId')) {
    schema.add({ firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', index: true, default: null } });
  }

  // Convert business uniqueness to per-firm uniqueness before model compilation.
  for (const [fields, options] of schema.indexes()) {
    if (!options?.unique || Object.prototype.hasOwnProperty.call(fields, 'firmId')) continue;
    const nextFields = { firmId: 1, ...fields };
    const nextOptions = { ...options };
    delete nextOptions.name;
    const existingPartial = nextOptions.partialFilterExpression;
    nextOptions.partialFilterExpression = existingPartial
      ? { $and: [existingPartial, { firmId: { $type: 'objectId' } }] }
      : { firmId: { $type: 'objectId' } };
    const oldName = options.name || Object.keys(fields).map(k => `${k}_${fields[k]}`).join('_');
    try { schema.removeIndex(oldName); } catch (_) { /* index may already have been replaced */ }
    schema.index(nextFields, nextOptions);
  }

  function addTenantFilter() {
    const firmId = getFirmId();
    if (!firmId) return;
    const query = this.getQuery ? this.getQuery() : {};
    // Always force the active tenant. Never honor a caller-supplied different firmId.
    this.setQuery({ ...query, firmId });
  }

  [
    'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
    'countDocuments', 'exists', 'distinct', 'deleteMany', 'deleteOne',
    'updateMany', 'updateOne', 'replaceOne'
  ].forEach(hook => schema.pre(hook, addTenantFilter));

  schema.pre('aggregate', function () {
    const firmId = getFirmId();
    if (!firmId) return;
    const stage = { $match: { firmId: new mongoose.Types.ObjectId(String(firmId)) } };
    const first = this.pipeline()[0];
    if (first && (first.$geoNear || first.$search)) this.pipeline().splice(1, 0, stage);
    else this.pipeline().unshift(stage);
  });

  schema.pre('save', function (next) {
    const firmId = getFirmId();
    if (!firmId) return next();
    if (!this.firmId) this.firmId = firmId;
    if (this.firmId && String(this.firmId) !== String(firmId)) {
      return next(new Error('Cross-tenant write rejected'));
    }
    return next();
  });

  schema.pre('insertMany', function (next, docs) {
    const firmId = getFirmId();
    if (!firmId) return next();
    for (const doc of docs || []) {
      if (!doc.firmId) doc.firmId = firmId;
      if (String(doc.firmId) !== String(firmId)) return next(new Error('Cross-tenant write rejected'));
    }
    return next();
  });
};
