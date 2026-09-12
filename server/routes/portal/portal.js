const express = require('express');
const Invoice = require('../../models/Invoice');
const { authenticatePortalCustomer } = require('../../middleware/authenticatePortalCustomer');

const router = express.Router();

// Apply customer portal authentication middleware to all routes in this router
router.use(authenticatePortalCustomer);

// GET /api/portal/invoices — List only logged-in customer's invoices
router.get('/invoices', async (req, res) => {
  try {
    const invoices = await Invoice.find({
      type: 'sale',
      $or: [
        { customerId: req.customer._id },
        { customerName: req.customer.name }
      ]
    }).sort({ date: -1 }).lean();

    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portal/invoices/:id/pdf — PDF/Summary of customer's invoice (enforces ownership)
router.get('/invoices/:id/pdf', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).lean();
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const belongsToCustomer = (invoice.customerId && invoice.customerId.toString() === req.customer._id.toString()) ||
      (invoice.customerName && invoice.customerName.toLowerCase() === req.customer.name.toLowerCase());

    if (!belongsToCustomer) {
      return res.status(403).json({ error: 'Forbidden: You do not have access to this invoice' });
    }

    // Format PDF invoice data structure for downloading/printing
    res.json({
      title: `TAX INVOICE ${invoice.invoiceNo}`,
      invoiceNo: invoice.invoiceNo,
      date: invoice.date,
      customerName: invoice.customerName,
      billingAddress: invoice.partyAddress || req.customer.billingAddress,
      items: invoice.items || [],
      subTotal: invoice.baseAmount || invoice.amount,
      cgst: invoice.cgst || 0,
      sgst: invoice.sgst || 0,
      igst: invoice.igst || 0,
      tcsAmount: invoice.tcsAmount || 0,
      grandTotal: invoice.amount || invoice.nettTotal,
      amountPaid: invoice.amountPaid || 0,
      balanceDue: Math.max(0, (invoice.amount || 0) - (invoice.amountPaid || 0)),
      status: invoice.status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portal/receivables-ageing — Ageing breakdown for logged-in customer
router.get('/receivables-ageing', async (req, res) => {
  try {
    const unpaidInvoices = await Invoice.find({
      type: 'sale',
      isFinalized: true,
      status: { $in: ['unpaid', 'partially_paid'] },
      $or: [
        { customerId: req.customer._id },
        { customerName: req.customer.name }
      ]
    }).lean();

    const now = new Date();
    let current = 0;
    let days31To60 = 0;
    let days61To90 = 0;
    let days90Plus = 0;

    const invoiceBreakdown = unpaidInvoices.map(inv => {
      const balance = Math.max(0, (inv.amount || inv.nettTotal || 0) - (inv.amountPaid || 0));
      const invDate = inv.dueDate ? new Date(inv.dueDate) : (inv.date ? new Date(inv.date) : now);
      const ageDays = Math.floor((now - invDate) / (1000 * 60 * 60 * 24));

      if (ageDays <= 30) current += balance;
      else if (ageDays <= 60) days31To60 += balance;
      else if (ageDays <= 90) days61To90 += balance;
      else days90Plus += balance;

      return {
        id: inv._id,
        invoiceNo: inv.invoiceNo,
        date: inv.date,
        dueDate: inv.dueDate,
        totalAmount: inv.amount,
        balanceDue: balance,
        ageDays: Math.max(0, ageDays)
      };
    });

    const totalOutstanding = current + days31To60 + days61To90 + days90Plus;

    res.json({
      customerId: req.customer._id,
      customerName: req.customer.name,
      totalOutstanding,
      brackets: {
        current,
        days31To60,
        days61To90,
        days90Plus
      },
      invoices: invoiceBreakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portal/orders — List customer orders
router.get('/orders', async (req, res) => {
  try {
    const Order = require('../../models/Order');
    const orders = await Order.find({
      $or: [
        { customerId: req.customer._id },
        { customerName: req.customer.name },
        { customerPhone: req.customer.phone }
      ]
    }).sort({ createdAt: -1 }).lean();

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portal/orders/:id/track — Live order dispatch & tracking status
router.get('/orders/:id/track', async (req, res) => {
  try {
    const Order = require('../../models/Order');
    const Dispatch = require('../../models/Dispatch');

    const order = await Order.findById(req.params.id).lean();
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const belongsToCustomer = (order.customerId && order.customerId.toString() === req.customer._id.toString()) ||
      (order.customerName && order.customerName.toLowerCase() === req.customer.name.toLowerCase()) ||
      (order.customerPhone && req.customer.phone && order.customerPhone === req.customer.phone);

    if (!belongsToCustomer) {
      return res.status(403).json({ error: 'Forbidden: You do not have access to this order' });
    }

    const dispatch = await Dispatch.findOne({ orderId: order._id }).lean();

    res.json({
      orderId: order._id,
      orderNo: order.orderNo || order._id,
      orderStatus: order.status || 'processing',
      orderDate: order.createdAt || order.date,
      totalAmount: order.totalAmount || order.amount || 0,
      tracking: {
        dispatched: !!dispatch,
        dispatchStatus: dispatch ? dispatch.status : 'Pending Dispatch',
        carrier: dispatch ? (dispatch.carrier || dispatch.transport || dispatch.carrierName || 'Surface Express') : 'N/A',
        courierName: dispatch ? (dispatch.transport || dispatch.carrierName || dispatch.carrier || 'Surface Express') : 'N/A',
        vehicleNo: dispatch ? (dispatch.vehicleNo || 'N/A') : 'N/A',
        ewayBillNo: dispatch ? (dispatch.ewayBillNo || 'N/A') : 'N/A',
        lrNo: dispatch ? (dispatch.lrNo || 'N/A') : 'N/A',
        shippedAt: dispatch ? dispatch.createdAt : null
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET /api/portal/me — customer account profile and commercial terms
router.get('/me', async (req, res) => {
  const c = req.customer.toObject ? req.customer.toObject() : req.customer;
  res.json({
    id: c._id, name: c.name, company: c.company, email: c.email, phone: c.phone,
    tradeCategory: c.tradeCategory, paymentTerms: c.paymentTerms, creditLimit: c.creditLimit || 0,
    billingAddress: c.billingAddress, shippingAddress: c.shippingAddress,
    discountPercent: c.discountPercent || 0, portalEnabled: c.portalEnabled
  });
});

const Product = require('../../models/Product');
const InventoryEntry = require('../../models/InventoryEntry');
const Order = require('../../models/Order');
const CustomerPricing = require('../../models/CustomerPricing');
const SalesScheme = require('../../models/SalesScheme');

const portalMoney = n => Number(Number(n || 0).toFixed(2));
async function portalPrice(customer, product, qty=1) {
  const rule = await CustomerPricing.findOne({ customerId: customer._id, productId: product._id }).lean();
  let listRate = Number(product.price || product.mrp || 0), rate = listRate, discount = Number(customer.discountPercent || 0), source='standard';
  if (rule && (!rule.validUntil || new Date(rule.validUntil) >= new Date())) {
    if (rule.customRate != null) { rate=Number(rule.customRate); source='customer_rate'; }
    if (rule.discountPercent) { discount=Number(rule.discountPercent); source='customer_rule'; }
    const tier=(rule.volumeTiers||[]).filter(t=>Number(qty)>=Number(t.minQty||0)).sort((a,b)=>Number(b.minQty)-Number(a.minQty))[0];
    if (tier) { if (tier.fixedRate != null) rate=Number(tier.fixedRate); if (tier.discountPercent != null) discount=Number(tier.discountPercent); source='volume_tier'; }
  }
  return { listRate: portalMoney(listRate), rate: portalMoney(rate*(1-discount/100)), discountPercent:discount, pricingSource:source };
}
async function portalScheme(customer, productId, qty) {
  const now=new Date();
  const docs=await SalesScheme.find({active:true,productId,validFrom:{$lte:now},$or:[{validUntil:null},{validUntil:{$gte:now}}]}).lean();
  const eligible=docs.filter(x=>{const hasCustomer=!!x.customerIds?.length,hasType=!!x.customerTypes?.length;const customerMatch=hasCustomer&&x.customerIds.some(id=>String(id)===String(customer._id));const typeMatch=hasType&&x.customerTypes.includes(customer.tradeCategory);return ((!hasCustomer&&!hasType)||customerMatch||typeMatch)&&Number(qty)>=Number(x.minQty||1);});
  const x=eligible.sort((a,b)=>(Number(b.discountPercent||0)+Number(b.freeQty||0))-(Number(a.discountPercent||0)+Number(a.freeQty||0)))[0];
  if(!x)return null; let apps=Math.floor(Number(qty)/Number(x.minQty||1)); if(x.maxApplicationsPerOrder>0)apps=Math.min(apps,x.maxApplicationsPerOrder);
  return { code:x.code,name:x.name,discountPercent:Number(x.discountPercent||0),freeQty:apps*Number(x.freeQty||0) };
}

// GET /api/portal/catalog — customer-specific website catalog with sellable availability
router.get('/catalog', async (req,res)=>{
  try {
    const page=Math.max(1,Number(req.query.page||1)), limit=Math.min(100,Math.max(1,Number(req.query.limit||24))), q=String(req.query.q||'').trim();
    const filter=q?{$or:[{name:{$regex:q,$options:'i'}},{sku:{$regex:q,$options:'i'}},{description:{$regex:q,$options:'i'}}]}:{};
    const [products,total]=await Promise.all([Product.find(filter).sort({name:1}).skip((page-1)*limit).limit(limit).lean(),Product.countDocuments(filter)]);
    const ids=products.map(p=>p._id); const entries=await InventoryEntry.find({productId:{$in:ids},qtyBoxes:{$gt:0}}).lean();
    const inv={}; for(const e of entries){if(e.expiryDate&&new Date(e.expiryDate)<new Date())continue;const id=String(e.productId);inv[id]=(inv[id]||0)+Number(e.qtyBoxes||0);}
    const data=[]; for(const p of products){const pricing=await portalPrice(req.customer,p,1);data.push({_id:p._id,name:p.name,sku:p.sku||'',description:p.description||'',benefits:p.benefits||'',ingredients:p.ingredients||'',suggestedDosage:p.suggestedDosage||'',category:p.category||'General',productType:p.productType||'',disease:p.disease||'',colour:p.colour||'',weight:p.weight||'',image:p.image||p.imageUrl||'',size:p.size||'',mrp:Number(p.mrp||p.price||0),price:pricing.rate,discountPercent:pricing.discountPercent,pricingSource:pricing.pricingSource,availableQty:inv[String(p._id)]||0,inStock:(inv[String(p._id)]||0)>0});}
    res.json({data,pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
  } catch(e){res.status(500).json({error:e.message});}
});

router.get('/catalog/:id', async(req,res)=>{
  try{const p=await Product.findById(req.params.id).lean();if(!p)return res.status(404).json({error:'Product not found'});const qty=Math.max(1,Number(req.query.qty||1));const [pricing,scheme,entries]=await Promise.all([portalPrice(req.customer,p,qty),portalScheme(req.customer,p._id,qty),InventoryEntry.find({productId:p._id,qtyBoxes:{$gt:0}}).lean()]);const available=entries.filter(e=>!e.expiryDate||new Date(e.expiryDate)>=new Date()).reduce((s,e)=>s+Number(e.qtyBoxes||0),0);res.json({...p,customerPrice:pricing,scheme,availableQty:available,inStock:available>0});}catch(e){res.status(500).json({error:e.message});}
});

// POST /api/portal/orders — self-service order. Never mutates inventory.
router.post('/orders', async(req,res)=>{
  try{
    const items=Array.isArray(req.body.items)?req.body.items:[]; if(!items.length)return res.status(400).json({code:'ITEMS_REQUIRED',error:'At least one product is required'});
    const clientOrderRef=String(req.body.clientOrderRef||'').trim();
    if(clientOrderRef){const existing=await Order.findOne({clientOrderRef,customerId:req.customer._id}).lean();if(existing)return res.status(200).json({order:existing,idempotent:true});}
    const orderItems=[];let total=0;
    for(const row of items){const p=await Product.findById(row.productId).lean();if(!p)return res.status(404).json({code:'PRODUCT_NOT_FOUND',error:'Product not found'});const qty=Number(row.qty||0);if(qty<=0)return res.status(400).json({code:'INVALID_QUANTITY',error:`Invalid quantity for ${p.name}`});const pricing=await portalPrice(req.customer,p,qty),scheme=await portalScheme(req.customer,p._id,qty);const rate=portalMoney(pricing.rate*(1-Number(scheme?.discountPercent||0)/100)),freeQty=Number(scheme?.freeQty||0);orderItems.push({productId:p._id,name:p.name,qty,price:rate,size:p.size||'',fulfilledQty:0,backorderedQty:qty+freeQty,freeQty,discountPercent:portalMoney(pricing.discountPercent+Number(scheme?.discountPercent||0)),pricingSource:scheme?`${pricing.pricingSource}+scheme`:pricing.pricingSource,schemeCode:scheme?.code||''});total+=qty*rate;}
    const orderNo=`WEB-${Date.now().toString().slice(-10)}`;
    const order=await Order.create({orderNo,clientOrderRef,orderChannel:'website',customerId:req.customer._id,name:req.customer.name,email:req.customer.email||'portal@customer.invalid',phone:req.customer.phone||'-',shippingAddress:req.body.shippingAddress||req.customer.shippingAddress?.street||req.customer.billingAddress?.street||'-',billingAddress:req.customer.billingAddress?.street||'',customerPoNo:req.body.customerPoNo||'',expectedDeliveryDate:req.body.expectedDeliveryDate||null,paymentTerms:req.customer.paymentTerms||'',items:orderItems,totalAmount:portalMoney(total),status:'pending',sourceType:'online',approvalStatus:'none',approvalRequired:false,adminNotes:req.body.notes||''});
    res.status(201).json({order,message:'Order received. Goods will move only after the business finalizes a Sale Challan.'});
  }catch(e){if(e.code===11000&&req.body.clientOrderRef){const existing=await Order.findOne({clientOrderRef:req.body.clientOrderRef,customerId:req.customer._id}).lean();if(existing)return res.json({order:existing,idempotent:true});}res.status(400).json({error:e.message,code:'PORTAL_ORDER_FAILED'});}
});

router.post('/orders/:id/repeat', async(req,res)=>{
  try{const prior=await Order.findById(req.params.id).lean();if(!prior||String(prior.customerId)!==String(req.customer._id))return res.status(404).json({error:'Order not found'});req.body.items=(prior.items||[]).map(i=>({productId:i.productId,qty:i.qty}));req.body.clientOrderRef=req.body.clientOrderRef||`repeat-${prior._id}-${Date.now()}`;const orderItems=[];let total=0;for(const row of req.body.items){const p=await Product.findById(row.productId).lean();const pricing=await portalPrice(req.customer,p,row.qty),scheme=await portalScheme(req.customer,p._id,row.qty),rate=portalMoney(pricing.rate*(1-Number(scheme?.discountPercent||0)/100)),freeQty=Number(scheme?.freeQty||0);orderItems.push({productId:p._id,name:p.name,qty:Number(row.qty),price:rate,size:p.size||'',fulfilledQty:0,backorderedQty:Number(row.qty)+freeQty,freeQty,discountPercent:portalMoney(pricing.discountPercent+Number(scheme?.discountPercent||0)),pricingSource:'repeat_order',schemeCode:scheme?.code||''});total+=Number(row.qty)*rate;}const order=await Order.create({orderNo:`WEB-${Date.now().toString().slice(-10)}`,clientOrderRef:req.body.clientOrderRef,orderChannel:'website',customerId:req.customer._id,name:req.customer.name,email:req.customer.email||'portal@customer.invalid',phone:req.customer.phone||'-',shippingAddress:req.customer.shippingAddress?.street||prior.shippingAddress,billingAddress:req.customer.billingAddress?.street||prior.billingAddress,items:orderItems,totalAmount:portalMoney(total),status:'pending',sourceType:'existing_customer',approvalStatus:'none',approvalRequired:false,adminNotes:`Website repeat of ${prior.orderNo}`});res.status(201).json(order);}catch(e){res.status(400).json({error:e.message});}
});

router.get('/dashboard', async(req,res)=>{
 try{const [orders,invoices]=await Promise.all([Order.find({customerId:req.customer._id}).sort({createdAt:-1}).limit(10).lean(),Invoice.find({type:'sale',$or:[{customerId:req.customer._id},{customerName:req.customer.name}]}).sort({date:-1}).limit(20).lean()]);const outstanding=portalMoney(invoices.reduce((s,i)=>s+Math.max(0,Number(i.amount||i.nettTotal||0)-Number(i.amountPaid||0)),0));res.json({customer:{id:req.customer._id,name:req.customer.name,company:req.customer.company},summary:{openOrders:orders.filter(o=>!['fulfilled','delivered','cancelled'].includes(o.status)).length,outstanding,creditLimit:Number(req.customer.creditLimit||0),availableCredit:Number(req.customer.creditLimit||0)>0?Math.max(0,portalMoney(Number(req.customer.creditLimit)-outstanding)):null},recentOrders:orders,recentInvoices:invoices.slice(0,10)});}catch(e){res.status(500).json({error:e.message});}
});

module.exports = router;
