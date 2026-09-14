/**
 * Script to add DeviceEventEmitter listeners to frontend page components.
 * Run with: node add-frontend-listeners.js
 */
const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, 'app');

// Define which pages need which socket event listeners
const pageConfigs = [
  // Pages that already have DeviceEventEmitter but need more events
  {
    file: 'manufacturing.tsx',
    events: ['mfg_batch_completed_event', 'mfg_batch_cancelled_event', 'raw_material_updated_event', 'bom_updated_event', 'mfg_unit_updated_event'],
    loadFn: 'loadData',
    needsImport: false, // already imported
  },
  {
    file: 'inventories.tsx',
    events: ['product_updated_event', 'warehouse_updated_event', 'transfer_updated_event', 'challan_updated_event'],
    loadFn: 'loadData',
    needsImport: false,
  },
  {
    file: 'products.tsx',
    events: ['product_updated_event'],
    loadFn: 'load',
    needsImport: false,
  },
  {
    file: 'orders.tsx',
    events: ['order_updated_event'],
    loadFn: 'load',
    needsImport: false,
  },
  {
    file: 'payments.tsx',
    events: ['credit_note_updated_event'],
    loadFn: 'load',
    needsImport: false,
  },
  {
    file: 'index.tsx',
    events: ['invoice_updated_event', 'payment_updated_event', 'order_updated_event', 'challan_updated_event', 'customer_updated_event'],
    loadFn: 'load',
    needsImport: false,
  },

  // Pages that DON'T have DeviceEventEmitter yet
  {
    file: 'contacts.tsx',
    events: ['contact_updated_event'],
    loadFn: 'loadData',
    needsImport: true,
  },
  {
    file: 'quotations.tsx',
    events: ['quotation_updated_event'],
    loadFn: 'loadData',
    needsImport: true,
  },
  {
    file: 'parties/customers.tsx',
    events: ['customer_updated_event'],
    loadFn: 'loadData',
    needsImport: true,
  },
  {
    file: 'parties/vendors.tsx',
    events: ['vendor_updated_event'],
    loadFn: 'loadData',
    needsImport: true,
  },
  {
    file: 'queries.tsx',
    events: ['query_updated_event'],
    loadFn: 'loadData',
    needsImport: true,
  },
  {
    file: 'pricing.tsx',
    events: ['pricing_updated_event', 'product_updated_event'],
    loadFn: 'fetchProducts',
    needsImport: true,
  },
  {
    file: 'campaigns.tsx',
    events: ['campaign_updated_event'],
    loadFn: 'fetchCampaigns',
    needsImport: true,
  },
  {
    file: 'medicalreps.tsx',
    events: ['medrep_updated_event'],
    loadFn: 'loadMrs',
    needsImport: true,
  },
  {
    file: 'credit-notes.tsx',
    events: ['credit_note_updated_event'],
    loadFn: 'fetchNotes',
    needsImport: true,
  },
  {
    file: 'gst-returns.tsx',
    events: ['gst_return_updated_event', 'invoice_updated_event'],
    loadFn: 'fetchData',
    needsImport: true,
  },
  {
    file: 'rbac.tsx',
    events: ['rbac_updated_event'],
    loadFn: 'fetchUsers',
    needsImport: true,
  },
  {
    file: 'salescrm.tsx',
    events: ['customer_updated_event', 'order_updated_event', 'invoice_updated_event', 'contact_updated_event', 'task_updated_event'],
    loadFn: 'loadData',
    needsImport: true,
  },
  {
    file: 'inventorydispatch.tsx',
    events: ['inventory_updated_event', 'dispatch_updated_event', 'transfer_updated_event', 'challan_updated_event', 'sample_updated_event'],
    loadFn: 'loadData',
    needsImport: true,
  },
  {
    file: 'leads.tsx',
    events: ['contact_updated_event', 'customer_updated_event'],
    loadFn: 'loadData',
    needsImport: true,
  },
];

let totalAdded = 0;

for (const config of pageConfigs) {
  const filePath = path.join(APP_DIR, config.file);
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP: ${config.file} not found`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Step 1: Add DeviceEventEmitter import if needed
  if (config.needsImport && !content.includes('DeviceEventEmitter')) {
    // Find the existing react-native import and add DeviceEventEmitter to it
    const rnImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"]react-native['"]/;
    const match = content.match(rnImportRegex);
    if (match) {
      const imports = match[1].trim();
      if (!imports.includes('DeviceEventEmitter')) {
        const newImports = imports + ', DeviceEventEmitter';
        content = content.replace(match[0], `import {${newImports}} from 'react-native'`);
        modified = true;
      }
    } else {
      // No react-native import found, add one
      content = `import { DeviceEventEmitter } from 'react-native';\n` + content;
      modified = true;
    }
  }

  // Step 2: Add the useEffect listener block
  // For pages that already have listeners, add new listeners next to existing ones
  for (const event of config.events) {
    if (content.includes(`'${event}'`)) {
      continue; // Already has this event listener
    }

    // Find an appropriate useEffect to add listeners to
    // Look for an existing addListener pattern
    const existingListenerMatch = content.match(/const sub\d+\s*=\s*DeviceEventEmitter\.addListener\([^)]+\)/);
    if (existingListenerMatch) {
      // Add after the last existing listener
      const lastListenerRegex = /(const sub\d+\s*=\s*DeviceEventEmitter\.addListener\([^)]+\);?\n)/g;
      let lastMatch = null;
      let m;
      while ((m = lastListenerRegex.exec(content)) !== null) {
        lastMatch = m;
      }
      if (lastMatch) {
        const indent = lastMatch[0].match(/^\s*/)[0];
        const subNum = parseInt((lastMatch[0].match(/sub(\d+)/) || ['', '0'])[1]) + config.events.indexOf(event) + 1;
        const newListener = `${indent}const sub${subNum + 10} = DeviceEventEmitter.addListener('${event}', () => ${config.loadFn}());\n`;
        content = content.slice(0, lastMatch.index + lastMatch[0].length) + newListener + content.slice(lastMatch.index + lastMatch[0].length);

        // Also add cleanup: find the return cleanup block
        const cleanupSearch = `sub${parseInt((lastMatch[0].match(/sub(\d+)/) || ['', '0'])[1])}.remove()`;
        const cleanupIdx = content.indexOf(cleanupSearch);
        if (cleanupIdx !== -1) {
          const endOfLine = content.indexOf('\n', cleanupIdx);
          const cleanupIndent = cleanupSearch.match(/^\s*/)[0];
          const newCleanup = `\n${indent}      sub${subNum + 10}.remove();`;
          content = content.slice(0, endOfLine) + newCleanup + content.slice(endOfLine);
        }

        modified = true;
        totalAdded++;
      }
    } else {
      // No existing listeners, we need to find the useEffect where data is loaded
      // Look for useEffect(() => { ... loadFn ...}, [])
      const useEffectRegex = new RegExp(`useEffect\\(\\(\\)\\s*=>\\s*\\{[^}]*${config.loadFn}[^}]*\\}\\s*,\\s*\\[`, 'g');
      const ueMatch = useEffectRegex.exec(content);
      if (ueMatch) {
        // Add listener block right after the loadFn call in the useEffect
        const insertPos = ueMatch.index + ueMatch[0].length;
        // We need to add the listener right before the closing ], so let's find the return cleanup block
        // Actually, simpler: add a new useEffect after the existing one for socket listeners
        const closeBracketPos = content.indexOf(']);', insertPos);
        if (closeBracketPos !== -1) {
          const afterUseEffect = content.indexOf('\n', closeBracketPos) + 1;
          const listenerBlock = `
  // Socket.io real-time auto-refresh
  useEffect(() => {
${config.events.map((ev, i) => `    const socketSub${i + 1} = DeviceEventEmitter.addListener('${ev}', () => ${config.loadFn}());`).join('\n')}
    return () => {
${config.events.map((ev, i) => `      socketSub${i + 1}.remove();`).join('\n')}
    };
  }, []);\n`;
          content = content.slice(0, afterUseEffect) + listenerBlock + content.slice(afterUseEffect);
          modified = true;
          totalAdded += config.events.length;
          break; // All events added in one block
        }
      }
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ ${config.file}: socket listeners added`);
  } else {
    console.log(`⏭  ${config.file}: no changes needed`);
  }
}

console.log(`\n🎯 Total: ${totalAdded} new listeners added`);
