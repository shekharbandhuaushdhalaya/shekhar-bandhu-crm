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
    const { productId, batchYieldSize, ingredients } = req.body;
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
        qtyRequired: qty
      };
    });

    // Check if BOM already exists for this product
    let bom = await BillOfMaterials.findOne({ productId });
    if (bom) {
      // Update existing BOM
      bom.batchYieldSize = Number(batchYieldSize);
      bom.ingredients = validatedIngredients;
      await bom.save();
    } else {
      bom = await BillOfMaterials.create({
        productId,
        batchYieldSize: Number(batchYieldSize),
        ingredients: validatedIngredients
      });
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
