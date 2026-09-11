const express = require('express');
const router = express.Router();
const ProductQualitySpecification = require('../../models/ProductQualitySpecification');
const { authorize } = require('../../middleware/authorize');

router.get('/', authorize('quality:view'), async (req,res)=>{
  try {
    const filter={}; if(req.query.productId) filter.productId=req.query.productId; if(req.query.status) filter.status=req.query.status;
    res.json(await ProductQualitySpecification.find(filter).populate('productId','name sku size').sort({effectiveDate:-1}).lean());
  } catch(e){res.status(500).json({error:e.message});}
});
router.post('/', authorize('quality:create'), async(req,res)=>{
  try {
    const required=['productId','dosageForm','pharmacopoeialStandard','specificationVersion','tests'];
    for(const k of required) if(req.body[k]===undefined || req.body[k]==='') return res.status(400).json({error:`${k} is required`});
    const tests=Array.isArray(req.body.tests)?req.body.tests:[];
    if(!tests.length) return res.status(400).json({error:'At least one approved product-specific QC test is required'});
    const spec=await ProductQualitySpecification.create({...req.body,status:'draft'}); res.status(201).json(spec);
  }catch(e){res.status(400).json({error:e.message});}
});
router.patch('/:id/approve', authorize('quality:approve'), async(req,res)=>{
  try { const spec=await ProductQualitySpecification.findById(req.params.id); if(!spec)return res.status(404).json({error:'Specification not found'}); spec.status='approved'; spec.approvedBy=req.user?.id||null; spec.approvedByName=req.user?.name||''; spec.approvedAt=new Date(); await spec.save(); res.json(spec); }
  catch(e){res.status(400).json({error:e.message});}
});
module.exports=router;
