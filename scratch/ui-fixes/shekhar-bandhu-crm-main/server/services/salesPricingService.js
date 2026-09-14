const CustomerPricing = require('../models/CustomerPricing');
const SalesScheme = require('../models/SalesScheme');
const SystemSettings = require('../models/SystemSettings');
const Invoice = require('../models/Invoice');

const money = n => Number(Number(n || 0).toFixed(2));

async function resolvePrice(customer, product, qty) {
  const rule = customer ? await CustomerPricing.findOne({ customerId: customer._id, productId: product._id }).lean() : null;
  let listRate = Number(product.price || product.mrp || 0);
  let rateBase = listRate;
  let discountPercent = Number(customer?.discountPercent || 0);
  let pricingSource = 'standard';
  if (rule && (!rule.validUntil || new Date(rule.validUntil) >= new Date())) {
    if (rule.customRate != null) { rateBase = Number(rule.customRate); pricingSource = 'customer_rate'; }
    if (rule.discountPercent != null) { discountPercent = Number(rule.discountPercent); pricingSource = 'customer_rule'; }
    const tier = (rule.volumeTiers || [])
      .filter(t => Number(qty) >= Number(t.minQty || 0))
      .sort((a,b) => Number(b.minQty || 0) - Number(a.minQty || 0))[0];
    if (tier) {
      if (tier.fixedRate != null) rateBase = Number(tier.fixedRate);
      if (tier.discountPercent != null) discountPercent = Number(tier.discountPercent);
      pricingSource = 'volume_tier';
    }
  }
  return { rate: money(rateBase * (1 - discountPercent / 100)), listRate: money(listRate), discountPercent, pricingSource };
}

async function resolveScheme(customer, productId, qty) {
  const now = new Date();
  const rows = await SalesScheme.find({
    active: true,
    productId,
    validFrom: { $lte: now },
    $or: [{ validUntil: null }, { validUntil: { $gte: now } }],
  }).lean();
  const eligible = rows.filter(s => {
    const hasCustomers = Boolean(s.customerIds?.length);
    const hasTypes = Boolean(s.customerTypes?.length);
    const customerMatch = Boolean(customer && hasCustomers && s.customerIds.some(id => String(id) === String(customer._id)));
    const typeMatch = Boolean(customer && hasTypes && s.customerTypes.includes(customer.tradeCategory));
    return ((!hasCustomers && !hasTypes) || customerMatch || typeMatch) && Number(qty) >= Number(s.minQty || 1);
  }).sort((a,b) => (Number(b.discountPercent||0)+Number(b.freeQty||0)) - (Number(a.discountPercent||0)+Number(a.freeQty||0)));
  const scheme = eligible[0];
  if (!scheme) return null;
  let applications = Math.floor(Number(qty) / Number(scheme.minQty || 1));
  if (Number(scheme.maxApplicationsPerOrder || 0) > 0) applications = Math.min(applications, Number(scheme.maxApplicationsPerOrder));
  return { ...scheme, applications, calculatedFreeQty: applications * Number(scheme.freeQty || 0) };
}

async function getSalesPolicy() {
  const settings = await SystemSettings.findOne({ key: 'company_config' }).lean() || {};
  return settings.salesPolicy || { autoApproveBelow: 50000, maxAutoDiscountPercent: 10, blockCreditLimit: true, allowBackorder: true };
}

async function outstandingForCustomer(customerId) {
  if (!customerId) return 0;
  const invoices = await Invoice.find({ type: 'sale', customerId, isFinalized: true, status: { $nin: ['paid','cancelled','Cancelled'] } }).select('amount amountPaid').lean();
  return money(invoices.reduce((sum, inv) => sum + Math.max(0, Number(inv.amount || 0) - Number(inv.amountPaid || 0)), 0));
}

async function priceOrderItems(customer, productRows) {
  const items = [];
  let subtotal = 0, discount = 0, schemeBenefit = 0;
  for (const { product, qty } of productRows) {
    const pricing = await resolvePrice(customer, product, qty);
    const scheme = await resolveScheme(customer, product._id, qty);
    const schemeDiscount = Number(scheme?.discountPercent || 0);
    const finalRate = money(pricing.rate * (1 - schemeDiscount / 100));
    const freeQty = Number(scheme?.calculatedFreeQty || 0);
    subtotal += pricing.listRate * qty;
    discount += (pricing.listRate - finalRate) * qty;
    schemeBenefit += freeQty * finalRate;
    items.push({
      productId: product._id, name: product.name, qty, price: finalRate, size: product.size || '',
      fulfilledQty: 0, backorderedQty: qty + freeQty, freeQty,
      discountPercent: money(pricing.discountPercent + schemeDiscount),
      pricingSource: scheme ? `${pricing.pricingSource}+scheme` : pricing.pricingSource,
      schemeCode: scheme?.code || '',
    });
  }
  return {
    items,
    totalAmount: money(items.reduce((sum, item) => sum + item.price * item.qty, 0)),
    pricingSummary: { subtotal: money(subtotal), discount: money(discount), schemeBenefit: money(schemeBenefit) },
  };
}

async function evaluateOrderApproval(customer, orderItems, totalAmount) {
  const policy = await getSalesPolicy();
  const outstanding = await outstandingForCustomer(customer._id);
  const creditLimit = Number(customer.creditLimit || 0);
  const projected = money(outstanding + totalAmount);
  const creditExceeded = creditLimit > 0 && projected > creditLimit;
  const excessiveDiscount = orderItems.some(i => Number(i.discountPercent || 0) > Number(policy.maxAutoDiscountPercent ?? 10));
  const approvalRequired = (policy.blockCreditLimit !== false && creditExceeded)
    || excessiveDiscount
    || totalAmount >= Number(policy.autoApproveBelow ?? 50000);
  return {
    approvalRequired,
    policy,
    credit: { limit: creditLimit, outstanding, projected, available: creditLimit ? money(Math.max(0, creditLimit - outstanding)) : null, exceeded: creditExceeded },
  };
}

module.exports = { money, resolvePrice, resolveScheme, getSalesPolicy, outstandingForCustomer, priceOrderItems, evaluateOrderApproval };
