require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Firm = require('../models/Firm');
const { runWithTenant } = require('../utils/tenantContext');

const SHARED_FIELDS = [
  'category', 'description', 'disease', 'ingredients', 'image',
  'productType', 'colour', 'shape', 'weight', 'hsnCode', 'gstRate'
];

function validateMigrationConfig(env = process.env) {
  const mongoUri = String(env.MONGODB_URI || '').trim();
  if (!mongoUri) throw new Error('MONGODB_URI is required.');
  const firmId = String(env.MIGRATION_FIRM_ID || '').trim();
  if (!mongoose.Types.ObjectId.isValid(firmId)) {
    throw new Error('MIGRATION_FIRM_ID must be a valid MongoDB ObjectId.');
  }
  const apply = env.MIGRATE_PRODUCT_VARIANTS_APPLY === 'YES';
  if (apply && env.MIGRATE_PRODUCT_VARIANTS_CONFIRM !== 'YES') {
    throw new Error('Applying product variants requires MIGRATE_PRODUCT_VARIANTS_CONFIRM=YES.');
  }
  return { mongoUri, firmId, apply };
}

function groupProducts(products) {
  const groups = new Map();
  for (const product of products) {
    const normalizedName = String(product.name || '').trim().replace(/\s+/g, ' ').toUpperCase();
    if (!normalizedName) continue;
    if (!groups.has(normalizedName)) groups.set(normalizedName, []);
    groups.get(normalizedName).push(product);
  }
  return groups;
}

async function migrate(env = process.env) {
  const { mongoUri, firmId, apply } = validateMigrationConfig(env);
  let failed = false;

  try {
    await mongoose.connect(mongoUri);
    const firm = await Firm.findById(firmId).select('_id name').lean();
    if (!firm) throw new Error('MIGRATION_FIRM_ID does not match an existing firm.');

    await runWithTenant({ firmId: firm._id }, async () => {
      const products = await Product.find({});
      const groups = groupProducts(products);
      let candidateGroups = 0;
      let linkedProducts = 0;
      let skippedExistingRelationships = 0;

      for (const [name, group] of groups) {
        if (group.length < 2) continue;

        // Never overwrite an existing variant hierarchy automatically.
        if (group.some(product => product.parentId)) {
          skippedExistingRelationships += 1;
          console.log(`Skipped existing variant hierarchy "${name}" (SKUs: ${group.map(p => p.sku).join(', ')}).`);
          continue;
        }

        group.sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return aTime - bTime || String(a._id).localeCompare(String(b._id));
        });
        const parent = group[0];
        const children = group.slice(1);
        candidateGroups += 1;
        console.log(`Candidate "${name}": parent SKU ${parent.sku}; child SKUs: ${children.map(p => p.sku).join(', ')}.`);

        if (!apply) continue;

        for (const child of children) {
          child.parentId = parent._id;
          for (const field of SHARED_FIELDS) child[field] = parent[field];
          await child.save();
          linkedProducts += 1;
        }
      }

      if (apply) {
        console.log(`Applied product variant migration for firm ${firm._id}: ${candidateGroups} groups, ${linkedProducts} children linked.`);
      } else {
        console.log(`Dry run only for firm ${firm._id}: ${candidateGroups} candidate groups; no records changed. Review candidates, then set MIGRATE_PRODUCT_VARIANTS_APPLY=YES and MIGRATE_PRODUCT_VARIANTS_CONFIRM=YES to apply.`);
      }
      console.log(`Skipped ${skippedExistingRelationships} groups with existing parent relationships.`);
    });
  } catch (error) {
    failed = true;
    console.error('Product variant migration failed:', error.message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch (error) {
        failed = true;
        console.error('Database disconnect failed:', error.message);
      }
    }
  }

  if (failed) process.exitCode = 1;
}

if (require.main === module) migrate();

module.exports = { migrate, validateMigrationConfig, groupProducts, SHARED_FIELDS };
