const express = require('express');
const BillOfMaterials = require('../../models/BillOfMaterials');
const Product = require('../../models/Product');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const router = express.Router();

// GET /api/bom — List all BOM formulations
router.get('/', async (req, res) => {
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
router.get('/:productId', async (req, res) => {
  try {
    const bom = await BillOfMaterials.findOne({ productId: req.params.productId })
      .populate('productId', 'name sku size')
      .populate('ingredients.rawMaterialId', 'name sku unit')
      .lean();
    if (!bom) return res.status(404).json({ error: 'Formulation not configured for this product' });
    res.json(bom);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bom — Configure a BOM formulation
router.post('/', validate(schemas.bomSchema), async (req, res) => {
  try {
    const { productId, batchYieldSize, ingredients, isActive, productionNotes, overheadCost, stages } = req.body;
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
        itemType: ing.itemType === 'packaging' ? 'packaging' : 'formulation'
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
          targetDurationDays: duration
        };
      });
    }

    // Check if BOM already exists for this product
    let bom = await BillOfMaterials.findOne({ productId });
    if (bom) {
      // Update existing BOM
      bom.batchYieldSize = Number(batchYieldSize);
      bom.ingredients = validatedIngredients;
      if (isActive !== undefined) bom.isActive = isActive;
      if (productionNotes !== undefined) bom.productionNotes = productionNotes;
      if (overheadCost !== undefined) bom.overheadCost = Number(overheadCost);
      if (validatedStages !== undefined) bom.stages = validatedStages;
      await bom.save();
    } else {
      bom = await BillOfMaterials.create({
        productId,
        batchYieldSize: Number(batchYieldSize),
        ingredients: validatedIngredients,
        isActive: isActive !== undefined ? isActive : true,
        productionNotes: productionNotes || '',
        overheadCost: overheadCost !== undefined ? Number(overheadCost) : 0,
        stages: validatedStages || []
      });
    }
    // Automatically update Product's ingredients field with percentage proportions
    const populatedBom = await BillOfMaterials.findById(bom._id).populate('ingredients.rawMaterialId', 'name');
    if (populatedBom && populatedBom.ingredients && populatedBom.ingredients.length > 0) {
      const totalQty = populatedBom.ingredients.reduce((sum, ing) => sum + (ing.qtyRequired || 0), 0);
      if (totalQty > 0) {
        const ingredientsString = populatedBom.ingredients
          .map(ing => {
            const pct = ((ing.qtyRequired / totalQty) * 100).toFixed(1);
            const name = ing.rawMaterialId ? ing.rawMaterialId.name : 'Unknown Material';
            return `${name} (${pct}%)`;
          })
          .join(', ');
        await Product.findByIdAndUpdate(productId, { ingredients: ingredientsString });
      }
    }

    res.status(201).json(bom);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/bom/:id — Delete BOM formulation
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await BillOfMaterials.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Formulation not found' });
    res.json({ message: 'Formulation deleted successfully', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
