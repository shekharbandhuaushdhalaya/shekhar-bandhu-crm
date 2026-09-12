const express = require('express');
const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Challan = require('../../models/Challan');
const Customer = require('../../models/Customer');
const Product = require('../../models/Product');
const Warehouse = require('../../models/Warehouse');
const InventoryEntry = require('../../models/InventoryEntry');
const Invoice = require('../../models/Invoice');
const Payment = require('../../models/Payment');
const StockLedger = require('../../models/StockLedger');
const CreditNote = require('../../models/CreditNote');
const SalesScheme = require('../../models/SalesScheme');
const SalesReturn = require('../../models/SalesReturn');
const CommissionRule = require('../../models/CommissionRule');
const CustomerPricing = require('../../models/CustomerPricing');
const { withTransaction } = require('../../utils/withTransaction');
const { logAction } = require('../../utils/auditLogger');

const router = express.Router();
const money = n => Number((Number(n || 0)).toFixed(2));

async function nextNo(Model, field, prefix) {
  const last = await Model.findOne({ [field]: new RegExp(`^${prefix}-\\d+$`) }).sort({ createdAt: -1 }).lean();
  const n = last ? (parseInt(String(last[field]).split('-').pop(), 10) || 0) + 1 : 1;
  return `${prefix}-${String(n).padStart(5, '0')}`;
}

async function resolvePrice(customer, product, qty) {
  const rule = customer ? await CustomerPricing.findOne({ customerId: customer._id, productId: product._id }).lean() : null;
  let rate = Number(product.price || product.mrp || 0);
  let discountPercent = Number(customer?.discountPercent || 0);
  let pricingSource = 'standard';
  if (rule && (!rule.validUntil || new Date(rule.validUntil) >= new Date())) {
    if (rule.customRate != null) { rate = Number(rule.customRate); pricingSource = 'customer_rate'; }
    if (rule.discountPercent) { discountPercent = Number(rule.discountPercent); pricingSource = 'customer_rule'; }
    const tier = (rule.volumeTiers || []).filter(t => Number(qty) >= Number(t.minQty || 0)).sort((a,b) => Number(b.minQty)-Number(a.minQty))[0];
    if (tier) {
      if (tier.customRate != null) rate = Number(tier.customRate);
      if (tier.discountPercent != null) discountPercent = Number(tier.discountPercent);
      pricingSource = 'volume_tier';
    }
  }
  return { rate: money(rate * (1 - discountPercent / 100)), listRate: money(rate), discountPercent, pricingSource };
}

async function resolveScheme(customer, productId, qty) {
  const now = new Date();
  const candidates = await SalesScheme.find({ active: true, productId, validFrom: { $lte: now }, $or: [{ validUntil: null }, { validUntil: { $gte: now } }] }).lean();
  const eligible = candidates.filter(s => {
    const custOk = !s.customerIds?.length || (customer && s.customerIds.some(id => String(id) === String(customer._id)));
    const typeOk = !s.customerTypes?.length || (customer && s.customerTypes.includes(customer.tradeCategory));
    return (custOk || typeOk) && Number(qty) >= Number(s.minQty || 1);
  }).sort((a,b) => (Number(b.discountPercent||0) + Number(b.freeQty||0)) - (Number(a.discountPercent||0) + Number(a.freeQty||0)));
  if (!eligible.length) return null;
  const s = eligible[0];
  let applications = Math.floor(Number(qty) / Number(s.minQty || 1));
  if (s.maxApplicationsPerOrder > 0) applications = Math.min(applications, s.maxApplicationsPerOrder);
  return { ...s, applications, calculatedFreeQty: applications * Number(s.freeQty || 0) };
}

async function outstandingForCustomer(customerId) {
  if (!customerId) return 0;
  const rows = await Invoice.find({ type: 'sale', customerId, status: { $nin: ['paid','cancelled','draft'] } }).select('amount amountPaid').lean();
  return money(rows.reduce((sum, i) => sum + Math.max(0, Number(i.amount||0) - Number(i.amountPaid||0)), 0));
}

// Dashboard: operational + management view.
router.get('/dashboard', async (req, res) => {
  try {
    const start = req.query.from ? new Date(req.query.from) : new Date(new Date().setHours(0,0,0,0));
    const end = req.query.to ? new Date(req.query.to) : new Date();
    const [orders, invoices, payments, pendingApprovals, partials] = await Promise.all([
      Order.find({ createdAt: { $gte: start, $lte: end } }).lean(),
      Invoice.find({ type: 'sale', date: { $gte: start, $lte: end }, isFinalized: true }).lean(),
      Payment.find({ type: 'receive', date: { $gte: start, $lte: end } }).lean(),
      Order.countDocuments({ approvalStatus: 'pending_approval' }),
      Order.countDocuments({ status: 'partially_fulfilled' })
    ]);
    const sales = money(invoices.reduce((s,i)=>s+Number(i.amount||0),0));
    const collections = money(payments.reduce((s,p)=>s+Number(p.amount||0),0));
    const bySource = {};
    for (const o of orders) {
      const k = o.sourcePersonName || o.mrName || o.sourceType || 'Direct';
      bySource[k] = money((bySource[k]||0) + Number(o.totalAmount||0));
    }
    res.json({ period: { start, end }, kpis: { sales, orders: orders.length, invoices: invoices.length, collections, pendingApprovals, partiallyFulfilled: partials }, bySource });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Flexible sales order. No physical stock movement here.
router.post('/orders', async (req, res) => {
  try {
    const { customerId, items = [], warehouseId, sourceType='direct', sourcePersonId=null, sourcePersonName='', priority='normal', expectedDeliveryDate, customerPoNo='', notes='' } = req.body;
    if (!customerId || !items.length) return res.status(400).json({ code:'INVALID_ORDER', error:'Customer and at least one item are required' });
    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ code:'CUSTOMER_NOT_FOUND', error:'Customer not found' });
    const warehouse = warehouseId ? await Warehouse.findById(warehouseId) : null;
    const orderItems=[]; let subtotal=0, discount=0, schemeBenefit=0;
    for (const row of items) {
      const product = await Product.findById(row.productId);
      if (!product) return res.status(404).json({ code:'PRODUCT_NOT_FOUND', error:`Product not found: ${row.productId}` });
      const qty = Number(row.qty||0); if (qty<=0) return res.status(400).json({ code:'INVALID_QUANTITY', error:`Invalid quantity for ${product.name}` });
      const pricing = await resolvePrice(customer, product, qty);
      const scheme = await resolveScheme(customer, product._id, qty);
      const schemeDiscount = Number(scheme?.discountPercent || 0);
      const finalRate = money(pricing.rate * (1 - schemeDiscount/100));
      const freeQty = Number(scheme?.calculatedFreeQty || 0);
      subtotal += pricing.listRate * qty;
      discount += (pricing.listRate - finalRate) * qty;
      schemeBenefit += freeQty * finalRate;
      orderItems.push({ productId:product._id, name:product.name, qty, price:finalRate, size:product.size||'', fulfilledQty:0, backorderedQty:qty, freeQty, discountPercent:money(pricing.discountPercent+schemeDiscount), pricingSource: scheme ? `${pricing.pricingSource}+scheme` : pricing.pricingSource, schemeCode:scheme?.code||'' });
    }
    const totalAmount = money(orderItems.reduce((s,i)=>s+(i.price*i.qty),0));
    const outstanding = await outstandingForCustomer(customer._id);
    const creditLimit = Number(customer.creditLimit||0);
    const projected = money(outstanding + totalAmount);
    const SystemSettings = require('../../models/SystemSettings');
    const settings = await SystemSettings.findOne({ key: 'company_config' }).lean() || {};
    const policy = settings.salesPolicy || { autoApproveBelow: 50000, maxAutoDiscountPercent: 10, blockCreditLimit: true, allowBackorder: true };
    const creditExceeded = creditLimit > 0 && projected > creditLimit;
    const excessiveDiscount = orderItems.some(i=>Number(i.discountPercent)>Number(policy.maxAutoDiscountPercent ?? 10));
    const approvalRequired = (policy.blockCreditLimit !== false && creditExceeded) || excessiveDiscount || totalAmount >= Number(policy.autoApproveBelow ?? 50000);
    const orderNo = await nextNo(Order,'orderNo','SO');
    const order = await Order.create({ orderNo, customerId:customer._id, name:customer.name, email:customer.email||'sales@local.invalid', phone:customer.phone||'-', shippingAddress:req.body.shippingAddress || customer.shippingAddress?.street || customer.billingAddress?.street || '-', billingAddress:req.body.billingAddress || customer.billingAddress?.street || '', customerPoNo, expectedDeliveryDate:expectedDeliveryDate||null, priority, paymentTerms:customer.paymentTerms||'', warehouseId:warehouse?._id||null, warehouseName:warehouse?.name||'', items:orderItems, totalAmount, status:'pending', sourceType, sourcePersonId, sourcePersonName, mrId: sourceType==='mr'?sourcePersonId:null, mrName:sourceType==='mr'?sourcePersonName:'', adminNotes:notes, approvalRequired, approvalStatus:approvalRequired?'pending_approval':'none', pricingSummary:{ subtotal:money(subtotal), discount:money(discount), schemeBenefit:money(schemeBenefit) } });
    res.status(201).json({ order, credit: { limit:creditLimit, outstanding, projected, available: creditLimit ? money(Math.max(0,creditLimit-outstanding)) : null, exceeded:creditExceeded } });
  } catch(e) { res.status(400).json({ error:e.message, code:e.code||'ORDER_CREATE_FAILED' }); }
});

// Partial/split fulfillment. Creates a DRAFT Challan only; finalize endpoint remains the sole physical stock movement.
router.post('/orders/:id/fulfill', async (req,res)=>{
  try {
    const order=await Order.findById(req.params.id); if(!order) return res.status(404).json({code:'ORDER_NOT_FOUND',error:'Order not found'});
    if(order.approvalRequired && order.approvalStatus!=='approved') return res.status(409).json({code:'ORDER_APPROVAL_REQUIRED',error:'Order must be approved before fulfillment'});
    if(['cancelled','fulfilled','delivered'].includes(order.status)) return res.status(409).json({code:'ORDER_NOT_FULFILLABLE',error:`Order is ${order.status}`});
    const warehouseId=req.body.warehouseId||order.warehouseId; const wh=await Warehouse.findById(warehouseId); if(!wh) return res.status(404).json({code:'WAREHOUSE_NOT_FOUND',error:'Warehouse not found'});
    const requested=req.body.items||[]; const challanItems=[];
    for(const r of requested){
      const oi=order.items.find(i=>String(i.productId)===String(r.productId)); if(!oi) return res.status(400).json({code:'ORDER_ITEM_NOT_FOUND',error:'Item does not belong to order'});
      const remaining=Math.max(0,Number(oi.qty)+Number(oi.freeQty||0)-Number(oi.fulfilledQty||0)); const qty=Number(r.qty||0);
      if(qty<=0||qty>remaining) return res.status(400).json({code:'FULFILLMENT_EXCEEDS_REMAINING',error:`${oi.name}: remaining ${remaining}, requested ${qty}`});
      const product=await Product.findById(oi.productId);
      const packing=Number(r.packing||1);
      if (r.batchNo) {
        challanItems.push({productId:oi.productId,name:oi.name,qty,rate:oi.price,packing,hsnCode:product?.hsnCode||'',gstRate:product?.gstRate||0,batchNo:r.batchNo||'',vendorId:r.vendorId||'',vendorName:r.vendorName||''});
      } else {
        // No batch selected: suggest/allocate FEFO explicitly from available source-warehouse batches.
        const entries=await InventoryEntry.find({warehouseId:wh._id,productId:oi.productId,packing,qtyBoxes:{$gt:0}}).sort({expiryDate:1,mfgDate:1,createdAt:1}).lean();
        let remainingQty=qty;
        for(const entry of entries){
          if(remainingQty<=0) break;
          if(entry.expiryDate && new Date(entry.expiryDate)<new Date()) continue;
          const take=Math.min(remainingQty,Number(entry.qtyBoxes||0));
          if(take<=0) continue;
          challanItems.push({productId:oi.productId,name:oi.name,qty:take,rate:oi.price,packing,hsnCode:product?.hsnCode||'',gstRate:product?.gstRate||0,batchNo:entry.batchNo||'',vendorId:entry.vendorId||'',vendorName:entry.vendorName||''});
          remainingQty-=take;
        }
        if(remainingQty>0) return res.status(409).json({code:'INSUFFICIENT_STOCK',error:`Insufficient non-expired stock for ${oi.name}. Short by ${remainingQty} boxes.`});
      }
    }
    if(!challanItems.length) return res.status(400).json({code:'EMPTY_FULFILLMENT',error:'Select quantities to fulfill'});
    const challanNo=await nextNo(Challan,'challanNo','CH');
    const seq=(order.challanIds?.length||0)+1;
    const challan=await Challan.create({challanNo,challanType:'sale',salesOrderId:order._id,fulfillmentSequence:seq,partyName:order.name,shippingAddress:order.shippingAddress,warehouseId:wh._id,warehouseName:wh.name,items:challanItems,status:'draft',mode:'pakka',baseAmount:money(challanItems.reduce((s,i)=>s+i.qty*i.rate,0)),nettTotal:money(challanItems.reduce((s,i)=>s+i.qty*i.rate,0))});
    order.challanIds.push(challan._id); await order.save();
    res.status(201).json({challan,remaining:order.items.map(i=>({productId:i.productId,name:i.name,ordered:Number(i.qty)+Number(i.freeQty||0),fulfilled:i.fulfilledQty||0}))});
  } catch(e){res.status(400).json({error:e.message,code:e.code||'FULFILLMENT_CREATE_FAILED'});}
});

// Sync order fulfillment after a Challan has been finalized. Safe to call repeatedly.
router.post('/orders/:id/reconcile-fulfillment', async(req,res)=>{
  try{
    const order=await Order.findById(req.params.id); if(!order)return res.status(404).json({error:'Order not found'});
    const cs=await Challan.find({salesOrderId:order._id,status:'finalized',inventoryPostingStatus:'posted'}).lean();
    for(const oi of order.items){ oi.fulfilledQty=cs.flatMap(c=>c.items).filter(i=>String(i.productId)===String(oi.productId)).reduce((s,i)=>s+Number(i.qty||0),0); oi.backorderedQty=Math.max(0,Number(oi.qty)+Number(oi.freeQty||0)-Number(oi.fulfilledQty||0)); }
    const any=order.items.some(i=>i.fulfilledQty>0), done=order.items.every(i=>i.backorderedQty<=0); order.status=done?'fulfilled':any?'partially_fulfilled':'processing'; await order.save(); res.json(order);
  }catch(e){res.status(400).json({error:e.message});}
});

// Split tender payment: Cash + UPI + bank + cheque on one invoice.
router.post('/invoices/:id/split-payment', async(req,res)=>{
  try{
    const tenders=Array.isArray(req.body.tenders)?req.body.tenders:[]; if(!tenders.length)return res.status(400).json({code:'TENDERS_REQUIRED',error:'At least one payment tender is required'});
    const result=await withTransaction(async session=>{
      const inv=await Invoice.findById(req.params.id).session(session); if(!inv||inv.type!=='sale') throw Object.assign(new Error('Sale invoice not found'),{code:'INVOICE_NOT_FOUND'});
      const customer=inv.customerId?await Customer.findById(inv.customerId).session(session):await Customer.findOne({name:inv.customerName}).session(session); if(!customer)throw Object.assign(new Error('Customer not found'),{code:'CUSTOMER_NOT_FOUND'});
      const balance=Math.max(0,Number(inv.amount)-Number(inv.amountPaid||0)); const total=money(tenders.reduce((s,t)=>s+Number(t.amount||0),0)); if(total<=0||total>balance+0.01)throw Object.assign(new Error(`Payment total ${total} exceeds balance ${balance}`),{code:'PAYMENT_EXCEEDS_BALANCE'});
      const docs=[]; for(const t of tenders){ const [p]=await Payment.create([{type:'receive',partyType:'Customer',partyId:customer._id,partyName:customer.name,amount:Number(t.amount),unallocatedAmount:0,mode:t.method==='Cash'?'cash':'regular',paymentMethod:t.method,referenceNo:t.referenceNo||'',notes:t.notes||'',allocations:[{invoiceId:inv._id,invoiceNo:inv.invoiceNo,amountAllocated:Number(t.amount),amountApplied:Number(t.amount)}]}],{session}); docs.push(p); }
      inv.amountPaid=money(Number(inv.amountPaid||0)+total); inv.status=inv.amountPaid+0.01>=Number(inv.amount)?'paid':'partial'; inv.payments.push(...docs.map(p=>({paymentId:p._id,amountAllocated:p.amount,amountApplied:p.amount}))); await inv.save({session}); return {invoice:inv,payments:docs};
    }); res.json(result);
  }catch(e){res.status(400).json({error:e.message,code:e.code||'SPLIT_PAYMENT_FAILED'});}
});

// Return lifecycle. Posting is atomic and creates inventory IN + optional credit note.
router.post('/returns', async(req,res)=>{
  try{ const customer=await Customer.findById(req.body.customerId); if(!customer)return res.status(404).json({error:'Customer not found'}); const no=await nextNo(SalesReturn,'returnNo','SR'); const total=money((req.body.items||[]).reduce((s,i)=>s+Number(i.qty||0)*Number(i.rate||0),0)); const doc=await SalesReturn.create({...req.body,returnNo:no,customerName:customer.name,totalAmount:total,status:'draft'}); res.status(201).json(doc); }catch(e){res.status(400).json({error:e.message});}
});
router.post('/returns/:id/post', async(req,res)=>{
  try{ const result=await withTransaction(async session=>{ const ret=await SalesReturn.findById(req.params.id).session(session); if(!ret)throw Object.assign(new Error('Return not found'),{code:'RETURN_NOT_FOUND'}); if(ret.status==='posted')return {return:ret}; const wh=await Warehouse.findById(ret.warehouseId).session(session); if(!wh)throw Object.assign(new Error('Warehouse not found'),{code:'WAREHOUSE_NOT_FOUND'});
    if(ret.challanId){ const orig=await Challan.findById(ret.challanId).session(session).lean(); if(!orig||orig.status!=='finalized')throw Object.assign(new Error('Original posted Challan is required'),{code:'ORIGINAL_CHALLAN_REQUIRED'}); for(const it of ret.items){ const sold=orig.items.filter(x=>String(x.productId)===String(it.productId)&&(!it.batchNo||x.batchNo===it.batchNo)).reduce((s,x)=>s+Number(x.qty||0),0); if(Number(it.qty)>sold)throw Object.assign(new Error(`Return quantity exceeds dispatched quantity for ${it.name}`),{code:'RETURN_EXCEEDS_DISPATCH'}); } }
    for(const it of ret.items){ const p=await Product.findById(it.productId).session(session); if(!p)throw new Error(`Product not found: ${it.name}`); let entry=await InventoryEntry.findOne({warehouseId:wh._id,productId:p._id,packing:it.packing||1,batchNo:it.batchNo||''}).session(session); if(!entry){ entry=new InventoryEntry({warehouseId:wh._id,warehouseName:wh.name,productId:p._id,qtyBoxes:0,packing:it.packing||1,batchNo:it.batchNo||''}); } entry.qtyBoxes=Number(entry.qtyBoxes||0)+Number(it.qty); await entry.save({session}); await StockLedger.create([{productId:p._id,warehouseId:wh._id,warehouseName:wh.name,type:'IN',qtyBoxes:Number(it.qty),balanceBoxes:entry.qtyBoxes,reference:ret.returnNo,note:`Sales return ${ret.returnNo}`,createdBy:req.user?.name||'System',packing:it.packing||1,batchNo:it.batchNo||''}],{session}); }
    let credit=null; if(ret.resolution==='credit_note'){ const noteNo=await nextNo(CreditNote,'noteNo','CN'); [credit]=await CreditNote.create([{noteNo,type:'credit_note',invoiceId:ret.invoiceId,invoiceNo:ret.invoiceNo,partyType:'Customer',partyId:ret.customerId,partyName:ret.customerName,reason:`Sales return ${ret.returnNo}`,baseAmount:ret.totalAmount,totalAmount:ret.totalAmount,status:'finalized',items:ret.items.map(i=>({productId:i.productId,name:i.name,qty:i.qty,boxes:i.qty,packing:i.packing,rate:i.rate,amount:Number(i.qty)*Number(i.rate),batchNo:i.batchNo}))}],{session}); }
    ret.status='posted'; ret.postedAt=new Date(); ret.postedBy=req.user?.id||null; await ret.save({session}); return {return:ret,creditNote:credit}; }); res.json(result);
  }catch(e){res.status(400).json({error:e.message,code:e.code||'RETURN_POST_FAILED'});}
});

// Scheme configuration
router.get('/schemes', async(req,res)=>res.json(await SalesScheme.find({}).sort({createdAt:-1}).lean()));
router.post('/schemes', async(req,res)=>{try{res.status(201).json(await SalesScheme.create(req.body));}catch(e){res.status(400).json({error:e.message});}});
router.put('/schemes/:id', async(req,res)=>{try{res.json(await SalesScheme.findByIdAndUpdate(req.params.id,req.body,{new:true,runValidators:true}));}catch(e){res.status(400).json({error:e.message});}});

// Commission rules and calculated report
router.get('/commission-rules', async(req,res)=>res.json(await CommissionRule.find({}).sort({createdAt:-1}).lean()));
router.post('/commission-rules', async(req,res)=>{try{res.status(201).json(await CommissionRule.create(req.body));}catch(e){res.status(400).json({error:e.message});}});
router.get('/commissions', async(req,res)=>{try{ const from=req.query.from?new Date(req.query.from):new Date(new Date().getFullYear(),new Date().getMonth(),1), to=req.query.to?new Date(req.query.to):new Date(); const orders=await Order.find({createdAt:{$gte:from,$lte:to},status:{$nin:['draft','cancelled']},sourcePersonId:{$ne:null}}).lean(); const rules=await CommissionRule.find({active:true,validFrom:{$lte:to},$or:[{validUntil:null},{validUntil:{$gte:from}}]}).lean(); const rows=[]; for(const o of orders){ let rate=0; const rule=rules.find(r=>(!r.personId||String(r.personId)===String(o.sourcePersonId))&&r.basis==='net_sales'); if(rule){rate=Number(rule.percent||0); const slab=(rule.slabs||[]).find(s=>Number(o.totalAmount)>=Number(s.min||0)&&(s.max==null||Number(o.totalAmount)<=Number(s.max))); if(slab)rate=Number(slab.percent||rate);} rows.push({orderId:o._id,orderNo:o.orderNo,personId:o.sourcePersonId,personName:o.sourcePersonName||o.mrName,netSales:o.totalAmount,rate,commission:money(Number(o.totalAmount)*rate/100)}); } res.json({from,to,rows,total:money(rows.reduce((s,r)=>s+r.commission,0))}); }catch(e){res.status(500).json({error:e.message});}});


// Configurable approval/credit policy.
router.get('/policy', async (req,res)=>{ try { const SystemSettings=require('../../models/SystemSettings'); const st=await SystemSettings.findOne({key:'company_config'}).lean()||{}; res.json(st.salesPolicy||{autoApproveBelow:50000,maxAutoDiscountPercent:10,blockCreditLimit:true,allowBackorder:true}); } catch(e){res.status(500).json({error:e.message});} });
router.put('/policy', async (req,res)=>{ try { const SystemSettings=require('../../models/SystemSettings'); const current=await SystemSettings.findOne({key:'company_config'}); const policy={autoApproveBelow:Number(req.body.autoApproveBelow??50000),maxAutoDiscountPercent:Number(req.body.maxAutoDiscountPercent??10),blockCreditLimit:req.body.blockCreditLimit!==false,allowBackorder:req.body.allowBackorder!==false}; const st=current||new SystemSettings({key:'company_config'}); st.salesPolicy=policy; st.markModified('salesPolicy'); await st.save(); res.json(policy); } catch(e){res.status(400).json({error:e.message});} });

// FEFO batch availability to make fulfillment easy while retaining an explicit user selection.
router.get('/availability/:productId', async(req,res)=>{ try { const filter={productId:req.params.productId,qtyBoxes:{$gt:0}}; if(req.query.warehouseId)filter.warehouseId=req.query.warehouseId; const rows=await InventoryEntry.find(filter).sort({expiryDate:1,mfgDate:1,createdAt:1}).lean(); res.json(rows.map(r=>({_id:r._id,warehouseId:r.warehouseId,warehouseName:r.warehouseName,batchNo:r.batchNo||'',qtyBoxes:r.qtyBoxes,packing:r.packing||1,mfgDate:r.mfgDate,expiryDate:r.expiryDate,isExpired:r.expiryDate?new Date(r.expiryDate)<new Date():false,vendorId:r.vendorId||'',vendorName:r.vendorName||''}))); }catch(e){res.status(500).json({error:e.message});} });

// Quick Sale = order + draft Challan in one action. Physical stock still moves only when Challan is finalized.
router.post('/quick-sale', async(req,res)=>{ try {
  const {customerId,warehouseId,items=[]}=req.body; const customer=await Customer.findById(customerId), wh=await Warehouse.findById(warehouseId); if(!customer||!wh||!items.length)return res.status(400).json({code:'QUICK_SALE_INVALID',error:'Customer, warehouse and items are required'});
  const orderNo=await nextNo(Order,'orderNo','SO'); const orderItems=[]; let total=0;
  for(const row of items){const p=await Product.findById(row.productId); if(!p)throw Object.assign(new Error('Product not found'),{code:'PRODUCT_NOT_FOUND'}); const qty=Number(row.qty||0); if(qty<=0)throw Object.assign(new Error('Invalid quantity'),{code:'INVALID_QUANTITY'}); const pr=await resolvePrice(customer,p,qty), sc=await resolveScheme(customer,p._id,qty), sd=Number(sc?.discountPercent||0), rate=money(pr.rate*(1-sd/100)), freeQty=Number(sc?.calculatedFreeQty||0); orderItems.push({productId:p._id,name:p.name,qty,price:rate,size:p.size||'',fulfilledQty:0,backorderedQty:qty+freeQty,freeQty,discountPercent:money(pr.discountPercent+sd),pricingSource:sc?`${pr.pricingSource}+scheme`:pr.pricingSource,schemeCode:sc?.code||''}); total+=rate*qty;}
  const order=await Order.create({orderNo,customerId:customer._id,name:customer.name,email:customer.email||'sales@local.invalid',phone:customer.phone||'-',shippingAddress:req.body.shippingAddress||customer.shippingAddress?.street||customer.billingAddress?.street||'-',billingAddress:customer.billingAddress?.street||'',warehouseId:wh._id,warehouseName:wh.name,items:orderItems,totalAmount:money(total),status:'processing',sourceType:req.body.sourceType||'direct',sourcePersonId:req.body.sourcePersonId||null,sourcePersonName:req.body.sourcePersonName||'',approvalRequired:false,approvalStatus:'approved'});
  const challanNo=await nextNo(Challan,'challanNo','CH'); const challanItems=[];
  for(const row of items){
    const oi=orderItems.find(x=>String(x.productId)===String(row.productId)); const needed=Number(oi.qty)+Number(oi.freeQty||0), packing=Number(row.packing||1);
    if(row.batchNo){challanItems.push({productId:oi.productId,name:oi.name,qty:needed,rate:oi.price,packing,batchNo:row.batchNo,vendorId:row.vendorId||'',vendorName:row.vendorName||''}); continue;}
    const entries=await InventoryEntry.find({warehouseId:wh._id,productId:oi.productId,packing,qtyBoxes:{$gt:0}}).sort({expiryDate:1,mfgDate:1,createdAt:1}).lean(); let remain=needed;
    for(const e of entries){if(remain<=0)break;if(e.expiryDate&&new Date(e.expiryDate)<new Date())continue;const take=Math.min(remain,Number(e.qtyBoxes||0));if(take<=0)continue;challanItems.push({productId:oi.productId,name:oi.name,qty:take,rate:oi.price,packing,batchNo:e.batchNo||'',vendorId:e.vendorId||'',vendorName:e.vendorName||''});remain-=take;}
    if(remain>0){await Order.findByIdAndDelete(order._id);return res.status(409).json({code:'INSUFFICIENT_STOCK',error:`Insufficient non-expired stock for ${oi.name}. Short by ${remain} boxes.`});}
  }
  const challan=await Challan.create({challanNo,challanType:'sale',salesOrderId:order._id,fulfillmentSequence:1,partyName:customer.name,shippingAddress:order.shippingAddress,warehouseId:wh._id,warehouseName:wh.name,items:challanItems,status:'draft',mode:'pakka',baseAmount:money(total),nettTotal:money(total)}); order.challanIds=[challan._id]; await order.save(); res.status(201).json({order,challan,message:'Quick Sale prepared. Review and finalize the Challan to move stock.'});
}catch(e){res.status(400).json({error:e.message,code:e.code||'QUICK_SALE_FAILED'});} });

// Unified sales search across operational documents.
router.get('/search', async(req,res)=>{ try { const q=String(req.query.q||'').trim(); if(!q)return res.json({customers:[],orders:[],challans:[],invoices:[],products:[]}); const rx=new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'); const [customers,orders,challans,invoices,products]=await Promise.all([Customer.find({$or:[{name:rx},{company:rx},{phone:rx}]}).limit(10).lean(),Order.find({$or:[{orderNo:rx},{name:rx},{phone:rx}]}).limit(10).lean(),Challan.find({$or:[{challanNo:rx},{partyName:rx}]}).limit(10).lean(),Invoice.find({$or:[{invoiceNo:rx},{customerName:rx}]}).limit(10).lean(),Product.find({$or:[{name:rx},{sku:rx}]}).limit(10).lean()]); res.json({customers,orders,challans,invoices,products}); }catch(e){res.status(500).json({error:e.message});} });

// Customer and product analytics / profitability proxy using invoice net revenue.
router.get('/analytics', async(req,res)=>{ try { const from=req.query.from?new Date(req.query.from):new Date(new Date().getFullYear(),new Date().getMonth(),1),to=req.query.to?new Date(req.query.to):new Date(); const invoices=await Invoice.find({type:'sale',isFinalized:true,date:{$gte:from,$lte:to}}).lean(); const byCustomer={},byProduct={}; for(const inv of invoices){const ck=inv.customerName||'Unknown'; if(!byCustomer[ck])byCustomer[ck]={customer:ck,revenue:0,invoices:0}; byCustomer[ck].revenue=money(byCustomer[ck].revenue+Number(inv.amount||0)); byCustomer[ck].invoices++; for(const it of inv.items||[]){const pk=it.name||String(it.productId||'Unknown'); if(!byProduct[pk])byProduct[pk]={product:pk,revenue:0,qty:0}; byProduct[pk].revenue=money(byProduct[pk].revenue+Number(it.rate||0)*Number(it.qty||it.boxes||0)); byProduct[pk].qty+=Number(it.qty||it.boxes||0);}} res.json({from,to,customers:Object.values(byCustomer).sort((a,b)=>b.revenue-a.revenue),products:Object.values(byProduct).sort((a,b)=>b.revenue-a.revenue)}); }catch(e){res.status(500).json({error:e.message});} });

// Lists for returns.
router.get('/returns', async(req,res)=>{try{res.json(await SalesReturn.find({}).sort({createdAt:-1}).limit(200).lean());}catch(e){res.status(500).json({error:e.message});}});

module.exports = router;
