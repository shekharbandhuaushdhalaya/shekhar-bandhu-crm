const express = require('express');
const BillOfMaterials = require('../../models/BillOfMaterials');
const Product = require('../../models/Product');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const router = express.Router();

// GET /api/bom — List all BOM formulations
router.get('/', authorize('manufacturing:view'), async (req, res) => {
  try {
    const boms = await BillOfMaterials.find({})
      .populate('productId', 'name sku size')
      .populate('ingredients.rawMaterialId', 'name sku unit')
      .lean();
    res.json(boms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bom/:productId — Get BOM formulation for a specific product
router.get('/:productId', authorize('manufacturing:view'), async (req, res) => {
  try {
    const { all } = req.query;
    if (all === 'true') {
      const boms = await BillOfMaterials.find({ productId: req.params.productId })
        .populate('productId', 'name sku size')
        .populate('ingredients.rawMaterialId', 'name sku unit')
        .lean();
      return res.json(boms);
    }

    let bom = await BillOfMaterials.findOne({ productId: req.params.productId, isDefault: true })
      .populate('productId', 'name sku size')
      .populate('ingredients.rawMaterialId', 'name sku unit')
      .lean();
    if (!bom) {
      bom = await BillOfMaterials.findOne({ productId: req.params.productId })
        .populate('productId', 'name sku size')
        .populate('ingredients.rawMaterialId', 'name sku unit')
        .lean();
    }
    if (!bom) return res.status(404).json({ error: 'Formulation not configured for this product' });
    res.json(bom);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bom — Configure a BOM formulation
router.post('/', authorize('manufacturing:create'), validate(schemas.bomSchema), async (req, res) => {
  try {
    const { productId, recipeName, isDefault, batchYieldSize, ingredients, isActive, productionNotes, overheadCost, stages, defaultProductionType, defaultJobWorkMode, defaultPackagingMode, defaultJobWorkerId, formulationBasis, formulationBasisUnit } = req.body;
    if (!productId || !batchYieldSize || !ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({ error: 'Missing required formulation fields' });
    }

    const prod = await Product.findById(productId);
    if (!prod) return res.status(404).json({ error: 'Finished product not found' });

    // Validate ingredients list
    const validatedIngredients = ingredients.map(ing => {
      const qty = Number(ing.qtyRequired);
      if (!ing.rawMaterialId || isNaN(qty) || qty <= 0) {
        throw new Error('Invalid ingredient structure or quantity');
      }
      return {
        rawMaterialId: ing.rawMaterialId,
        qtyRequired: qty,
        itemType: ing.itemType === 'packaging' ? 'packaging' : 'formulation',
        stageName: ing.stageName || ''
      };
    });

    // Validate stages list if provided
    let validatedStages = undefined;
    if (stages && Array.isArray(stages)) {
      validatedStages = stages.map(st => {
        if (!st.name) throw new Error('Stage name is required');
        const duration = Number(st.targetDurationDays);
        if (isNaN(duration) || duration <= 0) throw new Error('Stage target duration must be a positive number');
        return {
          name: st.name.trim(),
          targetDurationHours: duration
        };
      });
    }

    const name = (recipeName || 'Standard Recipe').trim();
    const isDef = isDefault || false;

    // Check if BOM already exists for this product and name
    let bom = await BillOfMaterials.findOne({ productId, recipeName: name });
    const yieldBase = Number(batchYieldSize) && Number(batchYieldSize) > 0 ? Number(batchYieldSize) : 100;
    if (bom) {
      // Update existing BOM
      bom.batchYieldSize = yieldBase;
      bom.ingredients = validatedIngredients;
      bom.isDefault = isDef;
      if (isActive !== undefined) bom.isActive = isActive;
      if (productionNotes !== undefined) bom.productionNotes = productionNotes;
      if (overheadCost !== undefined) bom.overheadCost = Number(overheadCost);
      if (validatedStages !== undefined) bom.stages = validatedStages;
      if (formulationBasis !== undefined) bom.formulationBasis = Number(formulationBasis) || 100;
      if (formulationBasisUnit !== undefined) bom.formulationBasisUnit = formulationBasisUnit || 'ml';
      if (defaultProductionType !== undefined) bom.defaultProductionType = defaultProductionType;
      if (defaultJobWorkMode !== undefined) bom.defaultJobWorkMode = defaultJobWorkMode;
      if (defaultPackagingMode !== undefined) bom.defaultPackagingMode = defaultPackagingMode;
      if (defaultJobWorkerId !== undefined) bom.defaultJobWorkerId = defaultJobWorkerId || null;
      await bom.save();
    } else {
      bom = await BillOfMaterials.create({
        productId,
        recipeName: name,
        isDefault: isDef,
        batchYieldSize: yieldBase,
        ingredients: validatedIngredients,
        isActive: isActive !== undefined ? isActive : true,
        productionNotes: productionNotes || '',
        overheadCost: overheadCost !== undefined ? Number(overheadCost) : 0,
        formulationBasis: Number(formulationBasis) || 100,
        formulationBasisUnit: formulationBasisUnit || 'ml',
        stages: validatedStages || [],
        defaultProductionType: defaultProductionType || 'in_house',
        defaultJobWorkMode: defaultJobWorkMode || 'none',
        defaultPackagingMode: defaultPackagingMode || 'self_packed',
        defaultJobWorkerId: defaultJobWorkerId || null
      });
    }

    // Toggle defaults
    if (bom.isDefault) {
      await BillOfMaterials.updateMany(
        { productId, _id: { $ne: bom._id } },
        { $set: { isDefault: false } }
      );
    }
    // Automatically update Product's ingredients field with percentage proportions (formulation materials only)
    const populatedBom = await BillOfMaterials.findById(bom._id).populate('ingredients.rawMaterialId', 'name category');
    if (populatedBom && populatedBom.ingredients && populatedBom.ingredients.length > 0) {
      const formulationIngredients = populatedBom.ingredients.filter(ing => {
        const mat = ing.rawMaterialId;
        const isPkg = ing.itemType === 'packaging' || (mat && mat.category === 'Packaging');
        return !isPkg;
      });
      const totalQty = formulationIngredients.reduce((sum, ing) => sum + (ing.qtyRequired || 0), 0);
      if (totalQty > 0) {
        const ingredientsString = formulationIngredients
          .map(ing => {
            const pct = ((ing.qtyRequired / totalQty) * 100).toFixed(1);
            const name = ing.rawMaterialId ? ing.rawMaterialId.name : 'Unknown Material';
            return `${name} (${pct}%)`;
          })
          .join(', ');
        await Product.findByIdAndUpdate(productId, { ingredients: ingredientsString });
      } else {
        await Product.findByIdAndUpdate(productId, { ingredients: '' });
      }
    }

    if (req.io) {
      req.io.emit('bom_updated', { type: 'created', id: bom._id });
    }
    res.status(201).json(bom);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/bom/:id — Delete BOM formulation
router.delete('/:id', authorize('manufacturing:delete'), async (req, res) => {
  try {
    const deleted = await BillOfMaterials.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Formulation not found' });
    if (req.io) {
      req.io.emit('bom_updated', { type: 'deleted', id: req.params.id });
    }
    res.json({ message: 'Formulation deleted successfully', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
