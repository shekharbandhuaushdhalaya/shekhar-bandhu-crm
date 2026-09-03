const mongoose = require('mongoose');

const rawMaterialSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, unique: true, trim: true },
  unit: { type: String, required: true, default: 'kg' }, // kg, g, l, ml, unit
  category: {
    type: String,
    enum: [
      'Metallic/Mineral',
      'Animal Source',
      'Fresh Herb',
      'Dry Herb',
      'Excipient',
      'Volatile Oil',
      'Plant Concentrate',
      'Schedule E1',
      'Inflammable',
      'Packaging',
      'Herb',
      'General',
      'Raw Material',
      'Packaging Material',
      'Other'
    ],
    default: 'Dry Herb'
  },
  isScheduleE1: { type: Boolean, default: false },
  minReorder: { type: Number, default: 0 },
  cleaningLossPercent: { type: Number, default: 0, min: 0, max: 100 }, // typical % lost during cleaning/sorting
  // GMP Pharmacopoeial Identity
  botanicalName: { type: String, default: '', trim: true },   // e.g. "Santalum album"
  partUsed: { type: String, default: '', trim: true },        // e.g. "Heartwood", "Root", "Leaf"
  pharmacopoeialStandard: {
    type: String,
    enum: ['API', 'AFI', 'IP', 'BP', 'USP', 'House Standard'],
    default: 'API'
  },
  monographRef: { type: String, default: '', trim: true },    // e.g. "API Part I, Vol II, pg 45"
}, { timestamps: true });

rawMaterialSchema.index({ name: 1 });
rawMaterialSchema.index({ category: 1 });

// Compound unique index for name + unit + category (case-insensitive)
rawMaterialSchema.index(
  { name: 1, unit: 1, category: 1 },
  {
    name: 'name_unit_category_unique_ci',
    unique: true,
    collation: { locale: 'en', strength: 2 }
  }
);

// Static helper to normalize raw material names (trim, collapse internal whitespace, lowercase)
rawMaterialSchema.statics.normalizeName = function (name) {
  if (!name) return '';
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
};

// Static helper to find duplicate raw material by case-insensitive name + unit + category
rawMaterialSchema.statics.findDuplicateByName = async function (name, { unit, category, excludeId } = {}) {
  if (!name) return null;
  const normalized = this.normalizeName(name);

  // Escape special regex characters
  const escapedName = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Construct regex pattern matching whitespace-collapsed name case-insensitively
  const regexPattern = `^${escapedName.split(' ').join('\\s+')}$`;

  const query = {
    name: { $regex: regexPattern, $options: 'i' },
  };

  if (unit) {
    const escapedUnit = unit.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.unit = { $regex: `^${escapedUnit}$`, $options: 'i' };
  }
  if (category) {
    const escapedCat = category.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.category = { $regex: `^${escapedCat}$`, $options: 'i' };
  }
  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return this.findOne(query);
};

module.exports = mongoose.model('RawMaterial', rawMaterialSchema);
