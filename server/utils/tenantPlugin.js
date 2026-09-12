const mongoose = require('mongoose');
const { getFirmId } = require('./tenantContext');

module.exports = function tenantPlugin(schema) {
  // Add ownership before model compilation.
  if (!schema.path('firmId')) schema.add({ firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', index: true, default: null } });

  // Every unique business index must be unique inside a firm, not globally.
  // This is done at schema-build time; the production migration then reconciles MongoDB indexes.
  for (const [fields, options] of schema.indexes()) {
    if (!options?.unique) continue;
    if (Object.prototype.hasOwnProperty.call(fields, 'firmId')) continue;
    const nextFields = { firmId: 1, ...fields };
    const nextOptions = { ...options };
    delete nextOptions.name;
    const existingPartial = nextOptions.partialFilterExpression;
    nextOptions.partialFilterExpression = existingPartial
      ? { $and: [existingPartial, { firmId: { $type: 'objectId' } }] }
      : { firmId: { $type: 'objectId' } };
    const oldName = options.name || Object.keys(fields).map(k => `${k}_${fields[k]}`).join('_');
    try { schema.removeIndex(oldName); } catch (_) {}
    schema.index(nextFields, nextOptions);
  }

  const addTenantFilter = function (next) {
    const firmId = getFirmId();
    if (firmId) {
      const query = this.getQuery();
      if (query.firmId && String(query.firmId) !== String(firmId)) {
        this.setQuery({ ...query, _id: { $exists: false } });
      } else {
        this.setQuery({ ...query, firmId });
      }
    }
    if (typeof next === 'function') next();
  };
  ['find','findOne','findOneAndUpdate','findOneAndDelete','findOneAndReplace','countDocuments','exists','distinct','deleteMany','updateMany'].forEach(h => schema.pre(h, addTenantFilter));
  schema.pre('aggregate', function (next) {
    const firmId = getFirmId();
    if (firmId) { const stage = { $match: { firmId } }; const first = this.pipeline()[0]; if (first && (first.$geoNear || first.$search)) this.pipeline().splice(1, 0, stage); else this.pipeline().unshift(stage); }
    if (typeof next === 'function') next();
  });
  schema.pre('save', function(next) {
    const firmId = getFirmId();
    if (firmId && !this.firmId) this.firmId = firmId;
    if (firmId && this.firmId && String(this.firmId) !== String(firmId)) return next(new Error('Cross-tenant write rejected'));
    next();
  });
  schema.pre('insertMany', function(next, docs) {
    const firmId = getFirmId();
    if (firmId) for (const doc of docs) {
      if (!doc.firmId) doc.firmId = firmId;
      if (doc.firmId && String(doc.firmId) !== String(firmId)) return next(new Error('Cross-tenant write rejected'));
    }
    next();
  });
};
