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
    // Keep tenant scope as an independent predicate. Merging with object spread
    // can replace an existing firmId condition and makes caller filters ambiguous.
    // The $and guarantees that a caller-supplied tenant can never widen access.
    this.setQuery({ $and: [query, { firmId }] });
  }

  [
    'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
    'countDocuments', 'exists', 'distinct', 'deleteMany', 'deleteOne',
    'updateMany', 'updateOne', 'replaceOne'
  ].forEach(hook => schema.pre(hook, addTenantFilter));

  // Mongoose bulkWrite does not execute query middleware. Wrap it so tenant
  // scope and immutable ownership are enforced for every supported bulk operation.
  schema.statics.bulkWrite = function (operations, options) {
    const firmId = getFirmId();
    if (!firmId) return mongoose.Model.bulkWrite.call(this, operations, options);
    if (!Array.isArray(operations)) throw new Error('Tenant-scoped bulkWrite requires an operations array');

    const containsFirmId = value => {
      if (!value || typeof value !== 'object') return false;
      if (Array.isArray(value)) return value.some(containsFirmId);
      return Object.entries(value).some(([key, nested]) =>
        key === 'firmId' || key.startsWith('firmId.') || containsFirmId(nested) ||
        (key === '$rename' && nested && Object.values(nested).some(target => String(target).startsWith('firmId')))
      );
    };
    const scopedFilter = filter => ({ $and: [filter || {}, { firmId }] });

    const scopedOperations = operations.map(operation => {
      if (operation.insertOne) {
        const document = { ...operation.insertOne.document };
        if (document.firmId && String(document.firmId) !== String(firmId)) {
          throw new Error('Cross-tenant write rejected');
        }
        document.firmId = firmId;
        return { insertOne: { ...operation.insertOne, document } };
      }
      if (operation.updateOne || operation.updateMany) {
        const key = operation.updateOne ? 'updateOne' : 'updateMany';
        const item = operation[key];
        if (Array.isArray(item.update) || containsFirmId(item.update)) {
          throw new Error('Tenant ownership is immutable; firmId updates are rejected');
        }
        const update = { ...(item.update || {}) };
        if (item.upsert) update.$setOnInsert = { ...(update.$setOnInsert || {}), firmId };
        return { [key]: { ...item, filter: scopedFilter(item.filter), update } };
      }
      if (operation.replaceOne) {
        const item = operation.replaceOne;
        const replacement = { ...(item.replacement || {}) };
        if (replacement.firmId && String(replacement.firmId) !== String(firmId)) {
          throw new Error('Cross-tenant write rejected');
        }
        replacement.firmId = firmId;
        return { replaceOne: { ...item, filter: scopedFilter(item.filter), replacement } };
      }
      if (operation.deleteOne || operation.deleteMany) {
        const key = operation.deleteOne ? 'deleteOne' : 'deleteMany';
        const item = operation[key];
        return { [key]: { ...item, filter: scopedFilter(item.filter) } };
      }
      throw new Error('Unsupported bulkWrite operation in tenant context');
    });

    return mongoose.Model.bulkWrite.call(this, scopedOperations, options);
  };

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
