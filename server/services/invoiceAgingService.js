const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(value, fallback) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    const safe = new Date(fallback);
    safe.setHours(0, 0, 0, 0);
    return safe;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function getInvoiceAgeMetrics(invoice, now = new Date()) {
  const today = startOfDay(now, new Date());
  const invoiceDate = startOfDay(invoice.date || invoice.createdAt || today, today);
  const dueDate = startOfDay(invoice.dueDate || invoice.date || invoice.createdAt || today, today);
  const daysOld = Math.max(0, Math.floor((today.getTime() - invoiceDate.getTime()) / DAY_MS));
  if (dueDate.getTime() >= today.getTime()) {
    return { daysOld, daysOverdue: 0, bucket: 'notDue', label: 'Not due' };
  }
  const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / DAY_MS));
  if (daysOverdue <= 30) return { daysOld, daysOverdue, bucket: 'b0_30', label: '0-30' };
  if (daysOverdue <= 60) return { daysOld, daysOverdue, bucket: 'b31_60', label: '31-60' };
  if (daysOverdue <= 90) return { daysOld, daysOverdue, bucket: 'b61_90', label: '61-90' };
  return { daysOld, daysOverdue, bucket: 'b90_plus', label: '90+' };
}

module.exports = { getInvoiceAgeMetrics };
