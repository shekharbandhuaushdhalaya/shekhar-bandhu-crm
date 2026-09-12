const express = require('express');
const Customer = require('../../models/Customer');
const Order = require('../../models/Order');
const Invoice = require('../../models/Invoice');
const Payment = require('../../models/Payment');
const Challan = require('../../models/Challan');
const MrVisit = require('../../models/MrVisit');
const Product = require('../../models/Product');
const InventoryEntry = require('../../models/InventoryEntry');
const PaymentPromise = require('../../models/PaymentPromise');
const LostSale = require('../../models/LostSale');
const { authorize } = require('../../middleware/authorize');
const { createSalesOrder } = require('../../services/salesOrderService');

const router = express.Router();
const money = n => Number(Number(n || 0).toFixed(2));

async function outstanding(customerId) {
  const rows = await Invoice.find({ type:'sale', customerId, isFinalized:true, status:{ $nin:['paid','cancelled','draft'] } }).select('amount nettTotal amountPaid dueDate date invoiceNo status').lean();
  return rows.map(i => ({ ...i, balance: money(Number(i.amount || i.nettTotal || 0) - Number(i.amountPaid || 0)) }));
}

function creditHealth(customer, invoices, promises) {
  const now = new Date();
  const overdue = invoices.filter(i => i.balance > 0 && new Date(i.dueDate || i.date || now) < now);
  const overdueValue = money(overdue.reduce((s,i)=>s+i.balance,0));
  const missed = promises.filter(p => p.status === 'missed').length;
  const limit = Number(customer.creditLimit || 0);
  const total = money(invoices.reduce((s,i)=>s+i.balance,0));
  const util = limit > 0 ? total / limit : 0;
  let label='GOOD', score=90;
  if (overdueValue > 0) score -= 20;
  if (overdueValue > Math.max(25000, limit * .25)) score -= 25;
  if (missed) score -= Math.min(30, missed * 10);
  if (util > .9) score -= 20;
  if (score < 50) label='RISK'; else if (score < 75) label='WATCH';
  return { label, score: Math.max(0,score), totalOutstanding:total, overdueValue, creditLimit:limit, availableCredit: limit > 0 ? Math.max(0,money(limit-total)) : null, utilizationPercent: limit > 0 ? money(util*100) : null, missedPromises:missed };
}

router.get('/customers/:id/360', authorize('customer:view'), async (req,res) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) return res.status(404).json({code:'CUSTOMER_NOT_FOUND',error:'Customer not found'});
    const [orders, challans, invoices, payments, visits, promises] = await Promise.all([
      Order.find({customerId:customer._id}).sort({createdAt:-1}).limit(20).lean(),
      Challan.find({partyName:customer.name}).sort({createdAt:-1}).limit(20).lean(),
      Invoice.find({type:'sale',$or:[{customerId:customer._id},{customerName:customer.name}]}).sort({date:-1}).limit(20).lean(),
      Payment.find({type:'receive',$or:[{partyId:customer._id},{partyName:customer.name}]}).sort({date:-1,createdAt:-1}).limit(20).lean(),
      MrVisit.find({$or:[{customerId:customer._id},{doctorName:customer.name}]}).sort({date:-1}).limit(20).lean(),
      PaymentPromise.find({customerId:customer._id}).sort({promisedDate:-1}).limit(20).lean()
    ]);
    const openInvoices = await outstanding(customer._id);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const monthSales = money(invoices.filter(i=>new Date(i.date||i.createdAt)>=monthStart).reduce((s,i)=>s+Number(i.amount||i.nettTotal||0),0));
    const latest = [
      ...orders.map(x=>({type:'order',date:x.createdAt,label:x.orderNo||'Order',amount:x.totalAmount,status:x.status})),
      ...challans.map(x=>({type:'challan',date:x.createdAt,label:x.challanNo||'Challan',amount:x.nettTotal,status:x.status})),
      ...invoices.map(x=>({type:'invoice',date:x.date||x.createdAt,label:x.invoiceNo||'Invoice',amount:x.amount||x.nettTotal,status:x.status})),
      ...payments.map(x=>({type:'payment',date:x.date||x.createdAt,label:'Payment',amount:x.amount,status:x.paymentMethod||x.mode}))
    ].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,30);
    res.json({customer,summary:{monthSales,lastSale:invoices[0]?.date||null,openOrders:orders.filter(o=>!['fulfilled','delivered','cancelled'].includes(o.status)).length,creditHealth:creditHealth(customer,openInvoices,promises)},orders,challans,invoices,payments,visits,promises,activity:latest});
  } catch(e){res.status(500).json({error:e.message});}
});

router.post('/orders/:id/repeat', authorize('order:create'), async (req,res) => {
  try {
    const prior = await Order.findById(req.params.id).lean();
    if (!prior) return res.status(404).json({code:'ORDER_NOT_FOUND',error:'Order not found'});
    if (!prior.customerId) return res.status(409).json({code:'CUSTOMER_LINK_REQUIRED',error:'The source order is not linked to a CRM customer and cannot be repeated safely.'});
    const result = await createSalesOrder({
      customerId: prior.customerId,
      warehouseId: req.body.warehouseId || prior.warehouseId || null,
      shippingAddress: req.body.shippingAddress || prior.shippingAddress,
      billingAddress: prior.billingAddress,
      customerPoNo: req.body.customerPoNo || '',
      expectedDeliveryDate: req.body.expectedDeliveryDate || null,
      priority: req.body.priority || prior.priority || 'normal',
      items: (prior.items || []).map(item => ({ productId: item.productId, qty: Number(item.qty || 0) })),
      sourceType: req.body.sourceType || 'existing_customer',
      sourcePersonId: req.body.sourcePersonId || null,
      sourcePersonName: req.body.sourcePersonName || '',
      notes: `Repeated from ${prior.orderNo || prior._id}. ${req.body.notes || ''}`.trim(),
      orderChannel: 'crm',
    });
    res.status(result.approvalRequired ? 202 : 201).json(result);
  } catch(e){res.status(e.status || 400).json({error:e.message,code:e.code || 'REPEAT_ORDER_FAILED'});}
});

router.get('/collections', authorize('payment:view'), async(req,res)=>{
  try{
    const invoices=await Invoice.find({type:'sale',isFinalized:true,status:{$nin:['paid','cancelled','draft']}}).sort({dueDate:1,date:1}).lean();
    const now=new Date(); const buckets={dueToday:0,days1to30:0,days31to60:0,days60plus:0};
    const rows=invoices.map(i=>{const balance=money(Number(i.amount||i.nettTotal||0)-Number(i.amountPaid||0)); const due=new Date(i.dueDate||i.date||now); const days=Math.floor((now-due)/(86400000)); if(Math.abs(days)<=0)buckets.dueToday+=balance; else if(days<=30)buckets.days1to30+=balance; else if(days<=60)buckets.days31to60+=balance; else buckets.days60plus+=balance; return {...i,balance,daysOverdue:Math.max(0,days)};});
    const promises=await PaymentPromise.find({status:'pending'}).sort({promisedDate:1}).lean();
    const overduePromises=[]; for(const p of promises){ if(new Date(p.promisedDate)<now){ await PaymentPromise.updateOne({_id:p._id,status:'pending'},{$set:{status:'missed'}}); overduePromises.push({...p,status:'missed'}); } }
    res.json({buckets:Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,money(v)])),rows,promises:[...promises.filter(p=>new Date(p.promisedDate)>=now),...overduePromises]});
  }catch(e){res.status(500).json({error:e.message});}
});

router.post('/payment-promises', authorize('payment:create'), async(req,res)=>{
  try{const c=await Customer.findById(req.body.customerId); if(!c)return res.status(404).json({error:'Customer not found'}); const p=await PaymentPromise.create({...req.body,customerName:c.name,createdBy:req.user?.name||req.user?.email||''});res.status(201).json(p);}catch(e){res.status(400).json({error:e.message});}
});
router.patch('/payment-promises/:id', authorize('payment:create'), async(req,res)=>{try{const data={...req.body};if(['kept','missed','cancelled'].includes(data.status))data.resolvedAt=new Date();res.json(await PaymentPromise.findByIdAndUpdate(req.params.id,data,{new:true,runValidators:true}));}catch(e){res.status(400).json({error:e.message});}});

router.post('/lost-sales', authorize('customer:create'), async(req,res)=>{try{const p=await Product.findById(req.body.productId);if(!p)return res.status(404).json({error:'Product not found'});let c=null;if(req.body.customerId)c=await Customer.findById(req.body.customerId);const doc=await LostSale.create({...req.body,productName:p.name,customerName:c?.name||req.body.customerName||'',estimatedValue:req.body.estimatedValue??Number(req.body.requestedQty||0)*Number(p.price||0)});res.status(201).json(doc);}catch(e){res.status(400).json({error:e.message});}});
router.get('/lost-sales', authorize('customer:view'), async(req,res)=>{try{const from=req.query.from?new Date(req.query.from):new Date(new Date().getFullYear(),new Date().getMonth(),1);const rows=await LostSale.find({occurredAt:{$gte:from}}).sort({occurredAt:-1}).lean();const byReason={},byProduct={};for(const r of rows){byReason[r.reason]=money((byReason[r.reason]||0)+Number(r.estimatedValue||0));byProduct[r.productName]=money((byProduct[r.productName]||0)+Number(r.estimatedValue||0));}res.json({totalLostValue:money(rows.reduce((s,r)=>s+Number(r.estimatedValue||0),0)),rows,byReason,byProduct});}catch(e){res.status(500).json({error:e.message});}});

router.get('/action-center', authorize('customer:view'), async(req,res)=>{
  try{
    const now=new Date(), dormantCutoff=new Date(now.getTime()-45*86400000);
    const [partialOrders,pendingApprovals,promises,customers] = await Promise.all([
      Order.find({status:'partially_fulfilled'}).sort({updatedAt:1}).limit(25).lean(),
      Order.find({approvalStatus:'pending_approval'}).sort({createdAt:1}).limit(25).lean(),
      PaymentPromise.find({status:{$in:['pending','missed']}}).sort({promisedDate:1}).limit(50).lean(),
      Customer.find({}).select('name company phone').lean()
    ]);
    const recentOrders=await Order.find({createdAt:{$gte:dormantCutoff}}).select('customerId').lean(); const active=new Set(recentOrders.map(o=>String(o.customerId)).filter(Boolean));
    const dormant=customers.filter(c=>!active.has(String(c._id))).slice(0,25);
    const overdueInvoices=(await Invoice.find({type:'sale',isFinalized:true,status:{$nin:['paid','cancelled','draft']}}).sort({dueDate:1}).limit(100).lean()).map(i=>({...i,balance:money(Number(i.amount||i.nettTotal||0)-Number(i.amountPaid||0))})).filter(i=>i.balance>0&&new Date(i.dueDate||i.date)<now).slice(0,30);
    res.json({counts:{partialOrders:partialOrders.length,pendingApprovals:pendingApprovals.length,paymentPromises:promises.length,dormantCustomers:dormant.length,overdueInvoices:overdueInvoices.length},partialOrders,pendingApprovals,promises,dormantCustomers:dormant,overdueInvoices});
  }catch(e){res.status(500).json({error:e.message});}
});

router.get('/margin-report', authorize('customer:view'), async(req,res)=>{
  try{
    const orders=await Order.find({status:{$nin:['draft','cancelled']}}).sort({createdAt:-1}).limit(Number(req.query.limit||100)).lean(); const productIds=[...new Set(orders.flatMap(o=>(o.items||[]).map(i=>String(i.productId))))];
    const entries=await InventoryEntry.find({productId:{$in:productIds}}).lean(); const cost={}; for(const e of entries){const id=String(e.productId); const c=Number(e.purchaseRate||e.rate||e.costPrice||0); if(c>0){cost[id]=cost[id]??{sum:0,n:0};cost[id].sum+=c;cost[id].n++;}}
    const rows=[]; for(const o of orders){let revenue=0,cogs=0;for(const i of o.items||[]){const q=Number(i.qty||0),r=Number(i.price||0),c=cost[String(i.productId)]?cost[String(i.productId)].sum/cost[String(i.productId)].n:0;revenue+=q*r;cogs+=q*c;}const margin=money(revenue-cogs);rows.push({orderId:o._id,orderNo:o.orderNo,customer:o.name,revenue:money(revenue),estimatedCogs:money(cogs),margin,marginPercent:revenue?money(margin/revenue*100):0});} res.json(rows);
  }catch(e){res.status(500).json({error:e.message});}
});

module.exports=router;
