/**
 * Script to add socket.io emissions to all backend route files.
 * Run with: node add-socket-emissions.js
 */
const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, 'routes');

// Define what to add for each file: [searchPattern, replacement]
// We search for the success response line and insert socket emission just before it.
const configs = [
  // === SALES ===
  {
    file: 'sales/invoices.js',
    insertions: [
      // POST /sales — create sale invoice
      { after: "res.status(201).json(invoice);", event: "invoice_updated", payload: "{ type: 'sale_created', id: invoice._id }", skipIndex: 0 },
      // POST /purchases — create purchase invoice
      { after: "res.status(201).json(invoice);", event: "invoice_updated", payload: "{ type: 'purchase_created', id: invoice._id }", skipIndex: 1 },
      // PUT /:id — update invoice
      { after: /res\.json\(invoice\);/, event: "invoice_updated", payload: "{ type: 'updated', id: invoice._id }", matchContext: "router.put" },
      // PATCH /sales/:id/finalize
      { after: /res\.json\(invoice\);/, event: "invoice_updated", payload: "{ type: 'sale_finalized', id: invoice._id }", matchContext: "finalize" , skipIndex: 0},
      // PATCH /purchases/:id/finalize
      { after: /res\.json\(invoice\);/, event: "invoice_updated", payload: "{ type: 'purchase_finalized', id: invoice._id }", matchContext: "purchases.*finalize" },
      // DELETE /sales/:id
      { after: "res.json({ message: 'Sale invoice marked as Cancelled' });", event: "invoice_updated", payload: "{ type: 'sale_deleted', id: req.params.id }" },
      // DELETE /purchases/:id
      { after: "res.json({ message: 'Purchase invoice marked as Cancelled' });", event: "invoice_updated", payload: "{ type: 'purchase_deleted', id: req.params.id }" },
    ]
  },
  {
    file: 'sales/orders.js',
    insertions: [
      { after: "res.json(order);", event: "order_updated", payload: "{ type: 'status_changed', id: order._id }", skipIndex: 0 },
      { after: "res.json(order);", event: "order_updated", payload: "{ type: 'updated', id: order._id }", skipIndex: 1 },
      { after: /res\.status\(201\)\.json\(\{ message: 'Order placed successfully'/, event: "order_updated", payload: "{ type: 'created', id: newOrder._id }" },
      { after: /res\.json\(\{ message: 'Order cancelled/, event: "order_updated", payload: "{ type: 'cancelled', id: order._id }" },
      { after: /res\.status\(201\)\.json\(\{ message: 'Draft invoice generated/, event: "invoice_updated", payload: "{ type: 'created_from_order', id: newInvoice._id }" },
    ]
  },
  {
    file: 'sales/quotations.js',
    insertions: [
      { after: "res.status(201).json(quotation);", event: "quotation_updated", payload: "{ type: 'created', id: quotation._id }" },
      { after: "res.json(quotation);", event: "quotation_updated", payload: "{ type: 'updated', id: quotation._id }" },
      { after: "res.json({ message: 'Quotation deleted' });", event: "quotation_updated", payload: "{ type: 'deleted', id: req.params.id }" },
    ]
  },
  {
    file: 'sales/customers.js',
    insertions: [
      { after: "res.status(201).json(doc);", event: "customer_updated", payload: "{ type: 'created', id: doc._id }" },
      { after: "res.json(doc);", event: "customer_updated", payload: "{ type: 'updated', id: doc._id }" },
      { after: "res.json({ message: 'Customer deleted' });", event: "customer_updated", payload: "{ type: 'deleted', id: req.params.id }" },
    ]
  },
  {
    file: 'sales/vendors.js',
    insertions: [
      { after: "res.status(201).json(vendor);", event: "vendor_updated", payload: "{ type: 'created', id: vendor._id }" },
      { after: "res.json(doc);", event: "vendor_updated", payload: "{ type: 'updated', id: doc._id }" },
      { after: "res.json({ message: 'Vendor deleted' });", event: "vendor_updated", payload: "{ type: 'deleted', id: req.params.id }" },
    ]
  },
  {
    file: 'sales/customerPricing.js',
    insertions: [
      { after: "res.json(pricing);", event: "pricing_updated", payload: "{ type: 'updated' }", skipIndex: 1 },
      { after: "res.json({ message: 'Special pricing removed' });", event: "pricing_updated", payload: "{ type: 'deleted' }" },
    ]
  },
  {
    file: 'sales/salesTargets.js',
    insertions: [
      { after: "res.status(201).json(target);", event: "sales_target_updated", payload: "{ type: 'created', id: target._id }" },
      { after: "res.json({ success: true });", event: "sales_target_updated", payload: "{ type: 'deleted', id: req.params.id }" },
    ]
  },
  // === INVENTORY ===
  {
    file: 'inventory/products.js',
    insertions: [
      { after: "res.status(201).json(product);", event: "product_updated", payload: "{ type: 'created', id: product._id }" },
      { after: "res.json(product);", event: "product_updated", payload: "{ type: 'updated', id: product._id }", skipIndex: 0 },
      { after: "res.json({ message: 'Product deleted' });", event: "product_updated", payload: "{ type: 'deleted', id: req.params.id }" },
    ]
  },
  {
    file: 'inventory/warehouses.js',
    insertions: [
      { after: "res.status(201).json(warehouse);", event: "warehouse_updated", payload: "{ type: 'created', id: warehouse._id }" },
      { after: "res.json(warehouse);", event: "warehouse_updated", payload: "{ type: 'updated', id: warehouse._id }" },
      { after: "res.json({ message:", event: "warehouse_updated", payload: "{ type: 'deleted', id: req.params.id }" },
    ]
  },
  {
    file: 'inventory/transfers.js',
    insertions: [
      { after: "res.status(201).json(transfer);", event: "transfer_updated", payload: "{ type: 'created', id: transfer._id }" },
    ]
  },
  // === MANUFACTURING ===
  {
    file: 'manufacturing/rawMaterials.js',
    insertions: [
      { after: "res.status(201).json(rm);", event: "raw_material_updated", payload: "{ type: 'created', id: rm._id }" },
      { after: "res.json(rm);", event: "raw_material_updated", payload: "{ type: 'updated', id: rm._id }", skipIndex: 0 },
      { after: "res.json({ message:", event: "raw_material_updated", payload: "{ type: 'deleted', id: req.params.id }", skipIndex: 0 },
      { after: "res.status(201).json(entry);", event: "raw_material_updated", payload: "{ type: 'entry_created', id: entry._id }" },
    ]
  },
  {
    file: 'manufacturing/bom.js',
    insertions: [
      { after: "res.status(201).json(bom);", event: "bom_updated", payload: "{ type: 'created', id: bom._id }" },
      { after: "res.json({ message:", event: "bom_updated", payload: "{ type: 'deleted', id: req.params.id }" },
    ]
  },
  {
    file: 'manufacturing/manufacturingUnits.js',
    insertions: [
      { after: "res.status(201).json(unit);", event: "mfg_unit_updated", payload: "{ type: 'created', id: unit._id }" },
      { after: "res.json(unit);", event: "mfg_unit_updated", payload: "{ type: 'updated', id: unit._id }" },
      { after: "res.json({ message:", event: "mfg_unit_updated", payload: "{ type: 'deleted', id: req.params.id }" },
    ]
  },
  // === CRM ===
  {
    file: 'crm/contacts.js',
    insertions: [
      { after: "res.status(201).json(contact);", event: "contact_updated", payload: "{ type: 'created', id: contact._id }" },
      { after: "res.json(contact);", event: "contact_updated", payload: "{ type: 'updated', id: contact._id }", skipIndex: 0 },
      { after: "res.json({ message:", event: "contact_updated", payload: "{ type: 'deleted', id: req.params.id }" },
    ]
  },
  {
    file: 'crm/tasks.js',
    insertions: [
      { after: "res.status(201).json(task);", event: "task_updated", payload: "{ type: 'created', id: task._id }" },
      { after: "res.json({ message:", event: "task_updated", payload: "{ type: 'deleted', id: req.params.id }" },
    ]
  },
  // === OPERATIONS ===
  {
    file: 'operations/dispatches.js',
    insertions: [
      { after: "res.status(201).json(dispatch);", event: "dispatch_updated", payload: "{ type: 'created', id: dispatch._id }" },
      { after: "res.json(dispatch);", event: "dispatch_updated", payload: "{ type: 'updated', id: dispatch._id }" },
      { after: "res.json({ message:", event: "dispatch_updated", payload: "{ type: 'deleted', id: req.params.id }" },
    ]
  },
  {
    file: 'operations/complaints.js',
    insertions: [
      { after: "res.status(201).json(complaint);", event: "complaint_updated", payload: "{ type: 'created', id: complaint._id }" },
      { after: "res.json(complaint);", event: "complaint_updated", payload: "{ type: 'updated', id: complaint._id }" },
      { after: "res.json({ message:", event: "complaint_updated", payload: "{ type: 'deleted', id: req.params.id }" },
    ]
  },
  {
    file: 'operations/samples.js',
    insertions: [
      { after: "res.status(201).json(sample);", event: "sample_updated", payload: "{ type: 'created', id: sample._id }" },
      { after: "res.json(sample);", event: "sample_updated", payload: "{ type: 'updated', id: sample._id }" },
      { after: "res.json({ message:", event: "sample_updated", payload: "{ type: 'deleted', id: req.params.id }" },
    ]
  },
  // === FINANCE ===
  {
    file: 'finance/creditNotes.js',
    insertions: [
      { after: "res.status(201).json(cn);", event: "credit_note_updated", payload: "{ type: 'created', id: cn._id }" },
      { after: "res.json(cn);", event: "credit_note_updated", payload: "{ type: 'updated', id: cn._id }", skipIndex: 0 },
    ]
  },
  // === MARKETING ===
  {
    file: 'marketing/campaigns.js',
    insertions: [
      { after: "res.status(201).json(campaign);", event: "campaign_updated", payload: "{ type: 'created', id: campaign._id }" },
      { after: "res.json(campaign);", event: "campaign_updated", payload: "{ type: 'updated', id: campaign._id }", skipIndex: 0 },
      { after: "res.json({ message:", event: "campaign_updated", payload: "{ type: 'deleted', id: req.params.id }" },
    ]
  },
  // === SYSTEM ===
  {
    file: 'system/rbac.js',
    insertions: [
      { after: "res.status(201).json(", event: "rbac_updated", payload: "{ type: 'created' }" },
      { after: "res.json({ message:", event: "rbac_updated", payload: "{ type: 'updated' }", skipIndex: 0 },
    ]
  },
  {
    file: 'system/queries.js',
    insertions: [
      { after: "res.json(query);", event: "query_updated", payload: "{ type: 'status_changed', id: query._id }" },
      { after: "res.status(201).json(", event: "query_updated", payload: "{ type: 'created' }" },
    ]
  },
  {
    file: 'system/notifications.js',
    insertions: [
      { after: "res.json(notification);", event: "notification_updated", payload: "{ type: 'read', id: notification._id }" },
      { after: "res.json({ message:", event: "notification_updated", payload: "{ type: 'read_all' }" },
    ]
  },
];

let totalInserted = 0;
let totalFiles = 0;

for (const config of configs) {
  const filePath = path.join(ROUTES_DIR, config.file);
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP: ${config.file} not found`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let lines = content.split('\n');
  let insertedInFile = 0;

  // For each insertion, find the target line and insert socket emission before it
  for (const ins of config.insertions) {
    const target = ins.after;
    let occurrenceIndex = ins.skipIndex || 0;
    let found = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let matches = false;

      if (typeof target === 'string') {
        matches = line.includes(target);
      } else {
        matches = target.test(line);
      }

      if (matches) {
        if (found === occurrenceIndex) {
          // Check if socket emission already exists nearby (within 5 lines before)
          const nearby = lines.slice(Math.max(0, i - 5), i).join('\n');
          if (nearby.includes('req.io')) {
            break; // Already has socket emission
          }

          // Detect indentation from the target line
          const indent = line.match(/^\s*/)[0];
          const socketCode = [
            `${indent}if (req.io) {`,
            `${indent}  req.io.emit('${ins.event}', ${ins.payload});`,
            `${indent}}`
          ];

          lines.splice(i, 0, ...socketCode);
          insertedInFile++;
          totalInserted++;
          break;
        }
        found++;
      }
    }
  }

  if (insertedInFile > 0) {
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log(`✅ ${config.file}: ${insertedInFile} socket emissions added`);
    totalFiles++;
  } else {
    console.log(`⏭  ${config.file}: no changes needed`);
  }
}

console.log(`\n🎯 Total: ${totalInserted} emissions added across ${totalFiles} files`);
