const express=require('express');
const RawMaterialQualitySpecification=require('../../models/RawMaterialQualitySpecification');
const RawMaterial=require('../../models/RawMaterial');
const {authorize}=require('../../middleware/authorize');
const {logAction}=require('../../utils/auditLogger');
const router=express.Router();
function validateTests(tests){
 if(!Array.isArray(tests)||!tests.length)return 'At least one material-specific incoming QC test is required';
 const codes=new Set();
 for(const test of tests){
  const code=String(test?.code||'').trim().toUpperCase();
  if(!code||!String(test?.name||'').trim()||!String(test?.specification||'').trim()||!String(test?.methodReference||'').trim())return 'Each test requires a unique code, name, acceptance specification and method reference';
  if(codes.has(code))return 'Duplicate incoming QC test code: '+code;
  codes.add(code);
 }
 if(!tests.some(test=>test.mandatory!==false))return 'At least one mandatory incoming QC test is required';
 return null;
}
router.get('/',authorize('quality:view'),async(req,res)=>{
 try{const filter={};if(req.query.rawMaterialId)filter.rawMaterialId=req.query.rawMaterialId;if(req.query.status)filter.status=req.query.status;res.json(await RawMaterialQualitySpecification.find(filter).sort({effectiveDate:-1,createdAt:-1}).lean());}
 catch(err){res.status(500).json({error:err.message});}
});
router.post('/',authorize('quality:create'),async(req,res)=>{
 try{
  const actorId=req.user?.id||req.user?._id,actorName=req.user?.name||req.user?.email;
  if(!actorId||!actorName)return res.status(401).json({error:'Authenticated specification author identity is required'});
  const {rawMaterialId,pharmacopoeialStandard,monographReference,specificationVersion,effectiveDate,tests,sourceNote}=req.body||{};
  if(!rawMaterialId||!String(pharmacopoeialStandard||'').trim()||!String(specificationVersion||'').trim())return res.status(400).json({error:'rawMaterialId, pharmacopoeialStandard and specificationVersion are required'});
  const testError=validateTests(tests);if(testError)return res.status(400).json({error:testError});
  const material=await RawMaterial.findById(rawMaterialId).lean();if(!material)return res.status(404).json({error:'Raw material not found'});
  const effective=effectiveDate===undefined?new Date():new Date(effectiveDate);if(Number.isNaN(effective.getTime()))return res.status(400).json({error:'effectiveDate must be a valid date'});
  const spec=await RawMaterialQualitySpecification.create({
   rawMaterialId:material._id,materialName:material.name,materialSku:material.sku,materialType:material.materialType||'raw_material',
   pharmacopoeialStandard:String(pharmacopoeialStandard).trim(),monographReference:String(monographReference||'').trim(),
   specificationVersion:String(specificationVersion).trim(),effectiveDate:effective,
   tests:tests.map(test=>({code:String(test.code).trim().toUpperCase(),name:String(test.name).trim(),category:test.category||'other',
    specification:String(test.specification).trim(),unit:String(test.unit||'').trim(),methodReference:String(test.methodReference).trim(),mandatory:test.mandatory!==false})),
   sourceNote:String(sourceNote||'').trim(),status:'draft',createdByUserId:actorId,createdByName:actorName,
   approvedByUserId:null,approvedByName:'',approvedAt:null
  });
  await logAction({action:'RAW_MATERIAL_QC_SPECIFICATION_CREATED',description:'Created incoming QC specification '+spec.specificationVersion+' for '+material.name,details:{specificationId:spec._id,rawMaterialId:material._id},req});
  res.status(201).json(spec);
 }catch(err){res.status(err.code===11000?409:400).json({error:err.code===11000?'This material specification version already exists':err.message});}
});
router.patch('/:id/approve',authorize('quality:approve'),async(req,res)=>{
 try{
  const spec=await RawMaterialQualitySpecification.findById(req.params.id);if(!spec)return res.status(404).json({error:'Incoming QC specification not found'});
  const reviewerId=req.user?.id||req.user?._id,reviewerName=req.user?.name||req.user?.email;
  if(!reviewerId||!reviewerName)return res.status(401).json({error:'Authenticated QA approver identity is required'});
  if(spec.status!=='draft')return res.status(409).json({error:'Only draft incoming QC specifications can be approved'});
  if(spec.createdByUserId&&String(spec.createdByUserId)===String(reviewerId))return res.status(409).json({error:'The specification author cannot approve their own specification'});
  const testError=validateTests(spec.tests);if(testError)return res.status(409).json({error:testError});
  if(new Date(spec.effectiveDate).getTime()>Date.now())return res.status(409).json({error:'A future-effective specification cannot be approved for current use'});
  spec.status='approved';spec.approvedByUserId=reviewerId;spec.approvedByName=reviewerName;spec.approvedAt=new Date();await spec.save();
  await logAction({action:'RAW_MATERIAL_QC_SPECIFICATION_APPROVED',description:'Approved incoming QC specification '+spec.specificationVersion,details:{specificationId:spec._id,rawMaterialId:spec.rawMaterialId},req});
  res.json(spec);
 }catch(err){res.status(400).json({error:err.message});}
});
module.exports=router;
