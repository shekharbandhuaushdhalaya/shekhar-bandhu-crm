const mongoose = require('mongoose');
const tenantPlugin = require('../utils/tenantPlugin');
const testSchema = new mongoose.Schema({
 code:{type:String,required:true,trim:true,uppercase:true}, name:{type:String,required:true,trim:true},
 category:{type:String,enum:['identity','organoleptic','physicochemical','assay','microbial','heavy_metals','aflatoxin','pesticide','foreign_matter','other'],default:'other'},
 specification:{type:String,required:true,trim:true}, unit:{type:String,default:'',trim:true},
 methodReference:{type:String,required:true,trim:true}, mandatory:{type:Boolean,default:true}
},{_id:false});
const schema=new mongoose.Schema({
 rawMaterialId:{type:mongoose.Schema.Types.ObjectId,ref:'RawMaterial',required:true,index:true},
 materialName:{type:String,required:true,trim:true}, materialSku:{type:String,required:true,trim:true},
 materialType:{type:String,required:true,trim:true}, pharmacopoeialStandard:{type:String,required:true,trim:true},
 monographReference:{type:String,default:'',trim:true}, specificationVersion:{type:String,required:true,trim:true},
 effectiveDate:{type:Date,required:true}, status:{type:String,enum:['draft','approved','superseded'],default:'draft',index:true},
 tests:{type:[testSchema],default:[]}, sourceNote:{type:String,default:'',trim:true},
 createdByUserId:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null}, createdByName:{type:String,default:'',trim:true},
 approvedByUserId:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null}, approvedByName:{type:String,default:'',trim:true},
 approvedAt:{type:Date,default:null}
},{timestamps:true});
schema.index({rawMaterialId:1,status:1,effectiveDate:-1});
schema.index({rawMaterialId:1,specificationVersion:1},{unique:true});
schema.plugin(tenantPlugin);
module.exports=mongoose.model('RawMaterialQualitySpecification',schema);
