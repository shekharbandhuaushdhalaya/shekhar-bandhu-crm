const express=require('express');
const MedicalRepresentative=require('../../models/MedicalRepresentative');
const MrAssignment=require('../../models/MrAssignment');
const MrVisit=require('../../models/MrVisit');
const MrTourPlan=require('../../models/MrTourPlan');
const MrExpense=require('../../models/MrExpense');
const Order=require('../../models/Order');
const PaymentPromise=require('../../models/PaymentPromise');
const FocusProduct=require('../../models/FocusProduct');
const CompetitorObservation=require('../../models/CompetitorObservation');
const Product=require('../../models/Product');
const { authorize }=require('../../middleware/authorize');
const router=express.Router();
const money=n=>Number(Number(n||0).toFixed(2));

function startOfDay(d=new Date()){const x=new Date(d);x.setHours(0,0,0,0);return x}
function endOfDay(d=new Date()){const x=new Date(d);x.setHours(23,59,59,999);return x}

router.get('/:mrId/my-day', authorize('mr:view'), async(req,res)=>{
 try{
  const mr=await MedicalRepresentative.findById(req.params.mrId).lean(); if(!mr)return res.status(404).json({error:'MR not found'});
  const today=startOfDay(), end=endOfDay();
  const [visits,assignments,promises,tourPlans,orders,focusProducts]=await Promise.all([
   MrVisit.find({mrId:mr._id,date:{$gte:today,$lte:end}}).sort({date:1}).lean(),
   MrAssignment.find({mrId:mr._id,isActive:true,$or:[{endDate:null},{endDate:{$gte:today}}]}).lean(),
   PaymentPromise.find({assignedMrId:mr._id,status:{$in:['pending','missed']},promisedDate:{$lte:end}}).sort({promisedDate:1}).lean(),
   MrTourPlan.find({mrId:mr._id}).sort({date:-1,createdAt:-1}).limit(10).lean(),
   Order.find({sourcePersonId:mr._id,status:{$in:['pending','processing','partially_fulfilled']}}).sort({createdAt:1}).limit(20).lean(),
   FocusProduct.find({active:true,validFrom:{$lte:end},$and:[{$or:[{validUntil:null},{validUntil:{$gte:today}}]},{$or:[{mrIds:{$size:0}},{mrIds:mr._id}]}]}).lean()
  ]);
  const completed=visits.filter(v=>v.status==='checked_out').length;
  const followups=await MrVisit.find({mrId:mr._id,followUpAt:{$gte:today,$lte:end},status:{$ne:'cancelled'}}).sort({followUpAt:1}).lean();
  const weekday=today.toLocaleDateString('en-US',{weekday:'long'});
  const dueAssignments=assignments.filter(a=>!a.preferredVisitDays?.length||a.preferredVisitDays.some(d=>String(d).toLowerCase()===weekday.toLowerCase())).slice(0,30);
  res.json({mr,date:today,summary:{plannedVisits:visits.length,completedVisits:completed,pendingVisits:Math.max(0,visits.length-completed),followUps:followups.length,collections:promises.length,pendingOrders:orders.length},nextVisit:visits.find(v=>v.status==='planned'||v.status==='checked_in')||null,visits,followups,paymentPromises:promises,dueAssignments,tourPlans,orders,focusProducts});
 }catch(e){res.status(500).json({error:e.message});}
});

router.get('/:mrId/coverage', authorize('mr:view'), async(req,res)=>{
 try{
  const from=req.query.from?new Date(req.query.from):new Date(new Date().getFullYear(),new Date().getMonth(),1), to=req.query.to?new Date(req.query.to):new Date();
  const assignments=await MrAssignment.find({mrId:req.params.mrId,isActive:true}).lean(); const visits=await MrVisit.find({mrId:req.params.mrId,date:{$gte:from,$lte:to},status:{$ne:'cancelled'}}).lean();
  const visited=new Set(visits.map(v=>String(v.doctorId||v.doctorName||'')).filter(Boolean));
  const byPriority={A:{assigned:0,visited:0},B:{assigned:0,visited:0},C:{assigned:0,visited:0},normal:{assigned:0,visited:0}};
  const rows=assignments.map(a=>{const key=String(a.entityId||a.entityName||'');const hit=visited.has(key)||visits.some(v=>v.doctorName&&a.entityName&&v.doctorName.toLowerCase()===a.entityName.toLowerCase());const p=byPriority[a.priority]||byPriority.normal;p.assigned++;if(hit)p.visited++;return {...a,visited:hit};});
  const total=assignments.length,covered=rows.filter(r=>r.visited).length; res.json({from,to,totalAssigned:total,covered,coveragePercent:total?money(covered/total*100):100,byPriority,missedPriorityA:rows.filter(r=>r.priority==='A'&&!r.visited),rows});
 }catch(e){res.status(500).json({error:e.message});}
});

router.post('/:mrId/focus-products', authorize('mr:create'), async(req,res)=>{
 try{const p=await Product.findById(req.body.productId);if(!p)return res.status(404).json({error:'Product not found'});const doc=await FocusProduct.create({...req.body,productId:p._id,productName:p.name,mrIds:req.body.mrIds?.length?req.body.mrIds:[req.params.mrId]});res.status(201).json(doc);}catch(e){res.status(400).json({error:e.message});}
});
router.get('/:mrId/focus-products', authorize('mr:view'), async(req,res)=>{try{const now=new Date();const docs=await FocusProduct.find({active:true,validFrom:{$lte:now},$and:[{$or:[{mrIds:{$size:0}},{mrIds:req.params.mrId}]},{$or:[{validUntil:null},{validUntil:{$gte:now}}]}]}).lean();const visits=await MrVisit.find({mrId:req.params.mrId,date:{$gte:new Date(now.getFullYear(),now.getMonth(),1)}}).lean();const orders=await Order.find({sourcePersonId:req.params.mrId,createdAt:{$gte:new Date(now.getFullYear(),now.getMonth(),1)},status:{$nin:['draft','cancelled']}}).lean();const rows=docs.map(d=>{const calls=visits.filter(v=>(v.promotedProducts||[]).some(x=>String(x.productId)===String(d.productId))).length;const productOrders=orders.reduce((n,o)=>n+(o.items||[]).some(i=>String(i.productId)===String(d.productId))?1:0,0);const sales=money(orders.reduce((s,o)=>s+(o.items||[]).filter(i=>String(i.productId)===String(d.productId)).reduce((a,i)=>a+Number(i.qty||0)*Number(i.price||0),0),0));return {...d,calls,orders:productOrders,sales,callAchievement:d.targetCalls?money(calls/d.targetCalls*100):null,orderAchievement:d.targetOrders?money(productOrders/d.targetOrders*100):null};});res.json(rows);}catch(e){res.status(500).json({error:e.message});}});

router.post('/:mrId/competitors', authorize('mr:create'), async(req,res)=>{try{const doc=await CompetitorObservation.create({...req.body,mrId:req.params.mrId});res.status(201).json(doc);}catch(e){res.status(400).json({error:e.message});}});
router.get('/:mrId/competitors', authorize('mr:view'), async(req,res)=>{try{res.json(await CompetitorObservation.find({mrId:req.params.mrId}).sort({observedAt:-1}).limit(200).lean());}catch(e){res.status(500).json({error:e.message});}});

router.get('/:mrId/attribution', authorize('mr:view'), async(req,res)=>{
 try{const from=req.query.from?new Date(req.query.from):new Date(new Date().getFullYear(),new Date().getMonth(),1),to=req.query.to?new Date(req.query.to):new Date();const [visits,orders,expenses]=await Promise.all([MrVisit.find({mrId:req.params.mrId,date:{$gte:from,$lte:to}}).lean(),Order.find({$or:[{sourcePersonId:req.params.mrId},{mrId:req.params.mrId}],createdAt:{$gte:from,$lte:to},status:{$nin:['draft','cancelled']}}).lean(),MrExpense.find({mrId:req.params.mrId,date:{$gte:from,$lte:to}}).lean()]);const promoted={};for(const v of visits)for(const p of v.promotedProducts||[])promoted[String(p.productId)]=(promoted[String(p.productId)]||0)+1;const sales=money(orders.reduce((s,o)=>s+Number(o.totalAmount||0),0)),cost=money(expenses.reduce((s,e)=>s+Number(e.amount||0),0));res.json({from,to,calls:visits.length,promotions:Object.values(promoted).reduce((a,b)=>a+b,0),orders:orders.length,sales,fieldCost:cost,salesPerCall:visits.length?money(sales/visits.length):0,roi:cost?money((sales-cost)/cost*100):null,visitToOrderPercent:visits.length?money(orders.length/visits.length*100):0});}catch(e){res.status(500).json({error:e.message});}
});

module.exports=router;
