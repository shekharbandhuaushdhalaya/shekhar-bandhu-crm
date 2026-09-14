const Challan = require('../models/Challan');
const Dispatch = require('../models/Dispatch');
const Order = require('../models/Order');

async function recomputeOrderLogisticsFromChallan(challanId) {
  const challan = await Challan.findById(challanId).lean();
  if (!challan?.salesOrderId) return null;
  const order = await Order.findById(challan.salesOrderId);
  if (!order) return null;

  const challans = await Challan.find({
    salesOrderId: order._id,
    status: 'finalized',
    inventoryPostingStatus: 'posted',
  }).select('_id').lean();
  const challanIds = challans.map(c => c._id);
  const dispatches = challanIds.length
    ? await Dispatch.find({ challanId: { $in: challanIds } }).sort({ dispatchDate: 1, createdAt: 1 }).lean()
    : [];

  const latest = dispatches[dispatches.length - 1];
  if (latest) {
    order.courierName = latest.courierName || latest.transporter || order.courierName || '';
    order.trackingId = latest.trackingId || latest.lrNo || order.trackingId || '';
    order.courierLink = latest.trackingUrl || order.courierLink || '';
  }

  const physicallyComplete = (order.items || []).length > 0 && (order.items || []).every(i => Number(i.backorderedQty || 0) <= 0);
  const anyFulfilled = (order.items || []).some(i => Number(i.fulfilledQty || 0) > 0);
  const activeTransit = dispatches.some(d => ['dispatched','in_transit','out_for_delivery'].includes(d.status));
  const deliveredIds = new Set(dispatches.filter(d => d.status === 'delivered').map(d => String(d.challanId)));
  const allPostedChallansDelivered = challanIds.length > 0 && challanIds.every(id => deliveredIds.has(String(id)));

  if (physicallyComplete && allPostedChallansDelivered) order.status = 'delivered';
  else if (activeTransit || dispatches.some(d => d.status === 'delivered')) order.status = 'shipped';
  else if (physicallyComplete) order.status = 'fulfilled';
  else if (anyFulfilled) order.status = 'partially_fulfilled';
  else if (!['cancelled','pending'].includes(order.status)) order.status = 'processing';

  await order.save();
  return order;
}

module.exports = { recomputeOrderLogisticsFromChallan };
