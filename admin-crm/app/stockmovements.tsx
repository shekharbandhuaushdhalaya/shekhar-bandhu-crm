import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput, Pressable,
  KeyboardAvoidingView, useWindowDimensions, Platform, Alert, DeviceEventEmitter
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Spacing, Radius, LightColors } from '../constants/theme';
import { api, StockMovement, StockMovementItem, Product, Warehouse, Customer, InventoryEntry } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';
import { useAuth } from '../utils/auth';
import { FIRM_DETAILS } from '../constants/firm';
import InventoryDispatchScreen from './inventorydispatch';

// ── Movement Type Config ────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; dir: 'out' }> = {
  sale:         { label: 'Sale',          icon: 'receipt-outline',       color: '#3b82f6', dir: 'out' },
  sample:       { label: 'Doctor Sample', icon: 'medical-outline',       color: '#8b5cf6', dir: 'out' },
  damage:       { label: 'Damage',        icon: 'alert-circle-outline',  color: '#ef4444', dir: 'out' },
  transfer_out: { label: 'Transfer Out',  icon: 'arrow-forward-circle-outline', color: '#f59e0b', dir: 'out' },
  order:        { label: 'Online Order',  icon: 'cart-outline',          color: '#10b981', dir: 'out' },
};

const STATUS_COLORS: Record<string, string> = {
  draft: '#f59e0b',
  dispatched: '#3b82f6',
  received: '#10b981',
  cancelled: '#ef4444',
};

// ── Print Delivery Challan ──────────────────────────────────────────────────────
const printDeliveryChallan = (m: StockMovement) => {
  if (Platform.OS !== 'web') { alert('Print is available on web only.'); return; }

  const dateStr = new Date(m.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const typeConf = TYPE_CONFIG[m.type] || { label: m.type };

  const itemRows = (m.items || []).map((it, i) => {
    const totalPcs = (it.qty || 0) * (it.packing || 1);
    const netRate = it.rate || 0;
    const itemTotal = totalPcs * netRate;
    const gstAmt = itemTotal * (it.gstRate || 0) / 100;
    return `
    <tr>
      <td style="border:1px solid #000;padding:2px;text-align:center;">${i + 1}</td>
      <td style="border:1px solid #000;padding:2px;">${it.productName}</td>
      <td style="border:1px solid #000;padding:2px;text-align:center;">${it.size || '—'}</td>
      <td style="border:1px solid #000;padding:2px;text-align:center;">${it.batchNo || '—'}</td>
      <td style="border:1px solid #000;padding:2px;text-align:center;">${totalPcs}</td>
      <td style="border:1px solid #000;padding:2px;text-align:right;">${it.mrp ? '₹' + Number(it.mrp).toFixed(2) : '—'}</td>
      <td style="border:1px solid #000;padding:2px;text-align:right;">${it.discountPercent ? it.discountPercent + '%' : '—'}</td>
      <td style="border:1px solid #000;padding:2px;text-align:right;">${it.gstRate ? it.gstRate + '%' : '—'}</td>
      <td style="border:1px solid #000;padding:2px;text-align:right;">₹${itemTotal.toFixed(2)}</td>
      <td style="border:1px solid #000;padding:2px;text-align:right;">₹${gstAmt.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const grandTotal = (m.items || []).reduce((sum, it) => {
    const totalPcs = (it.qty || 0) * (it.packing || 1);
    return sum + totalPcs * (it.rate || 0);
  }, 0);
  const totalGst = (m.items || []).reduce((sum, it) => {
    const totalPcs = (it.qty || 0) * (it.packing || 1);
    const itemTotal = totalPcs * (it.rate || 0);
    return sum + itemTotal * (it.gstRate || 0) / 100;
  }, 0);

  // Extra info block
  let extraInfo = '';
  if (m.type === 'sample' && ((m as any).medicalRepName || (m as any).doctorName)) {
    extraInfo = `
      <div style="margin-top:8px;padding:6px;border:1px dashed #666;font-size:10px;">
        <strong>MR Name:</strong> ${(m as any).medicalRepName || '—'} &nbsp;&nbsp;
        <strong>Doctor:</strong> ${(m as any).doctorName || '—'}
      </div>`;
  }
  if (m.type === 'damage' && (m as any).damageReason) {
    extraInfo = `
      <div style="margin-top:8px;padding:6px;border:1px dashed #f00;font-size:10px;color:#c00;">
        <strong>Damage Reason:</strong> ${(m as any).damageReason}
      </div>`;
  }

  // Parse partyAddress to extract billing and shipping addresses
  const rawAddr = m.partyAddress || '';
  const billingAddr = rawAddr.includes('Billing Address:')
    ? rawAddr.split('Shipping Address:')[0].replace('Billing Address:\n', '').replace('Billing Address:', '').trim()
    : rawAddr;
  const shippingAddr = rawAddr.includes('Shipping Address:')
    ? rawAddr.split('Shipping Address:')[1]?.replace('Shipping Address:\n', '').replace('Shipping Address:', '').trim() || ''
    : '';

  const copyBlock = (copy: string) => `
    <div style="height:50%;padding:3mm 5mm;display:flex;flex-direction:column;border:1.5px solid #000;">
      <div style="font-size:9px;font-weight:bold;text-align:center;letter-spacing:0.5px;border-bottom:1.5px solid #000;padding:2px;">
        DELIVERY CHALLAN — NOT A TAX INVOICE
      </div>
      <table style="font-size:6px;border:1px solid #000;">
        <tr>
          <td style="width:50%;padding:1.5px;border-right:1px solid #000;vertical-align:top;">
            <div style="font-weight:bold;font-size:7px;">${FIRM_DETAILS.name}</div>
            <div>${FIRM_DETAILS.address}</div>
            <div>GSTIN: ${FIRM_DETAILS.gstin} | Phone: ${FIRM_DETAILS.phone}</div>
            ${FIRM_DETAILS.manufacturingLicenseNo ? `<div>Mfg. Lic. No: ${FIRM_DETAILS.manufacturingLicenseNo}</div>` : ''}
            <div style="margin-top:1px;color:#555;font-style:italic;">${copy}</div>
          </td>
          <td style="width:50%;padding:1.5px;vertical-align:top;">
            <strong>Challan No.:</strong> ${m.docNo}<br/>
            <strong>Date:</strong> ${dateStr}<br/>
            <strong>Warehouse:</strong> ${m.warehouseName}
            ${(m as any).transporter ? `<br/><strong>Transporter:</strong> ${(m as any).transporter}` : ''}
            ${(m as any).lrNo ? `<br/><strong>LR/GR No:</strong> ${(m as any).lrNo}` : ''}
            ${(m as any).vehicleNo ? `<br/><strong>Vehicle:</strong> ${(m as any).vehicleNo}` : ''}
            ${(m as any).courierName ? `<br/><strong>Courier:</strong> ${(m as any).courierName}` : ''}
            ${(m as any).trackingId ? `<br/><strong>Tracking ID:</strong> ${(m as any).trackingId}` : ''}
            <br/><span style="font-size:5px;color:#555;">(CGST Rule 55 — ${typeConf.label})</span>
          </td>
        </tr>
      </table>
      <table style="font-size:6px;border:1px solid #000;">
        <tr>
          <td style="width:28%;padding:1.5px;border-right:1px solid #000;vertical-align:top;">
            <strong>Consignee:</strong> ${m.partyName}
            ${m.partyGstin ? `<br/><strong>GSTIN:</strong> ${m.partyGstin}` : ''}
          </td>
          <td style="width:36%;padding:1.5px;border-right:1px solid #000;vertical-align:top;">
            <strong>Billing:</strong> ${billingAddr ? billingAddr.replace(/\n/g, ', ') : '—'}
          </td>
          <td style="width:36%;padding:1.5px;vertical-align:top;">
            <strong>Shipping:</strong> ${shippingAddr ? shippingAddr.replace(/\n/g, ', ') : '—'}
          </td>
        </tr>
      </table>
      ${extraInfo}
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;">
        <div style="flex:1;overflow:hidden;">
        <table style="font-size:6px;width:100%;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="border:1px solid #000;padding:1.5px;width:3%;">#</th>
              <th style="border:1px solid #000;padding:1.5px;">Product</th>
              <th style="border:1px solid #000;padding:1.5px;width:6%;">Size</th>
              <th style="border:1px solid #000;padding:1.5px;width:10%;">Batch</th>
              <th style="border:1px solid #000;padding:1.5px;width:6%;">Qty</th>
              <th style="border:1px solid #000;padding:1.5px;width:8%;">MRP</th>
              <th style="border:1px solid #000;padding:1.5px;width:5%;">Disc</th>
              <th style="border:1px solid #000;padding:1.5px;width:5%;">GST%</th>
              <th style="border:1px solid #000;padding:1.5px;width:9%;">Amount</th>
              <th style="border:1px solid #000;padding:1.5px;width:8%;">GST Amt</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>
        </div>
      </div>
      ${m.notes ? `<div style="margin-top:2px;font-size:6px;"><strong>Notes:</strong> ${m.notes}</div>` : ''}
      <table style="margin-top:auto;font-size:6px;width:100%;">
        <tr>
          <td style="width:35%;padding:2px;border-right:1px solid #000;vertical-align:top;">
            <div style="font-weight:bold;font-size:7px;">Bank Details:</div>
            <div>${FIRM_DETAILS.bankName}</div>
            <div>A/C: ${FIRM_DETAILS.bankAccountNo}</div>
            <div>IFSC: ${FIRM_DETAILS.bankIfsc}</div>
            <div>Branch: ${FIRM_DETAILS.bankBranch}</div>
          </td>
          <td style="width:35%;padding:2px;border-right:1px solid #000;vertical-align:top;">
            <div style="font-weight:bold;font-size:7px;">Terms &amp; Conditions:</div>
            <div style="line-height:1.3;">${(FIRM_DETAILS.defaultTerms || '').split('\n').map(t => t.trim()).filter(Boolean).join('<br/>')}</div>
          </td>
          <td style="width:30%;padding:2px;vertical-align:top;">
            <table style="width:100%;font-size:6px;">
              <tr style="background:#e5e7eb;font-weight:bold;">
                <td style="border:1px solid #000;padding:1.5px;text-align:right;">Grand Total (excl. GST)</td>
                <td style="border:1px solid #000;padding:1.5px;text-align:right;">₹${grandTotal.toFixed(2)}</td>
              </tr>
              <tr style="background:#e5e7eb;font-weight:bold;">
                <td style="border:1px solid #000;padding:1.5px;text-align:right;">Total GST</td>
                <td style="border:1px solid #000;padding:1.5px;text-align:right;">₹${totalGst.toFixed(2)}</td>
              </tr>
              <tr style="background:#d1d5db;font-weight:bold;">
                <td style="border:1px solid #000;padding:1.5px;text-align:right;">Grand Total (incl. GST)</td>
                <td style="border:1px solid #000;padding:1.5px;text-align:right;">₹${(grandTotal + totalGst).toFixed(2)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <table style="font-size:6px;width:100%;border:1px solid #000;border-top:none;">
        <tr>
          <td style="width:50%;padding:2px;text-align:left;">
            <div>Receiver's Signature &amp; Stamp</div>
          </td>
          <td style="width:50%;padding:2px;text-align:right;">
            <div style="font-size:7px;">For ${FIRM_DETAILS.name}</div>
            ${(FIRM_DETAILS.signatureBase64 || FIRM_DETAILS.signatureUrl) ? `
              <img src="${FIRM_DETAILS.signatureBase64 || FIRM_DETAILS.signatureUrl}" style="max-height: 22px; width: auto; object-fit: contain; margin-top:2px;" />
            ` : ''}
            <div style="font-size:6px;margin-top:2px;">${FIRM_DETAILS.dscSignatoryName || 'Authorised Signatory'}</div>
          </td>
        </tr>
      </table>
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Delivery Challan ${m.docNo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #000; background: #fff; width:210mm; height:297mm; }
    .page { width:210mm; height:297mm; display:flex; flex-direction:column; }
    .half { height:50%; overflow:hidden; position:relative; }
    .separator { border:none; border-top:2px dashed #000; margin:0; }
    table { border-collapse: collapse; width: 100%; }
    @media print { @page { size: A4 portrait; margin: 0; } body { width:210mm; height:297mm; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="half">${copyBlock('Original (Receiver)')}</div>
    <hr class="separator"/>
    <div class="half">${copyBlock('Duplicate (Transporter)')}</div>
  </div>
  <script>window.print();</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=800,height=900');
  if (win) { win.document.write(html); win.document.close(); }
};
// ── End Print ──────────────────────────────────────────────────────────────────

interface FormState {
  direction: 'out';
  type: string;
  billingMode: 'cash' | 'regular';
  date: string;
  partyType: string;
  partyId?: string;
  partyName: string;
  partyGstin: string;
  partyAddress: string;
  billingAddress: string;
  shippingAddress: string;
  warehouseId: string;
  warehouseName: string;
  isFree: boolean;
  notes: string;
  status: string;
  medicalRepName: string;
  doctorName: string;
  damageReason: string;
  transporter?: string;
  lrNo?: string;
  vehicleNo?: string;
  courierName?: string;
  trackingId?: string;
  totalBoxes?: string;
  totalWeight?: string;
  freightCharge?: string;
}

const DEFAULT_FORM: FormState = {
  direction: 'out', type: 'sale', billingMode: 'regular',
  date: new Date().toISOString().split('T')[0],
  partyType: '', partyId: '', partyName: '', partyGstin: '', partyAddress: '',
  billingAddress: '', shippingAddress: '',
  warehouseId: '', warehouseName: '',
  isFree: false, notes: '', status: 'draft',
  medicalRepName: '', doctorName: '', damageReason: '',
  transporter: '', lrNo: '', vehicleNo: '', courierName: '', trackingId: '', totalBoxes: '1', totalWeight: '', freightCharge: '0',
};

const toTitleCase = (str?: string) => {
  if (!str) return '';
  return str
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

const formatSize = (size?: string) => {
  if (!size) return '';
  const cleaned = size.replace(/[\s.]+/g, '').toUpperCase();
  return cleaned ? `${cleaned}.` : '';
};

const formatWeight = (weight?: string) => {
  if (!weight) return '';
  let w = weight.replace(/\s+/g, '').toLowerCase();
  if (w.endsWith('gms')) {
    w = w.slice(0, -3) + 'g';
  } else if (!w.endsWith('g')) {
    w += 'g';
  }
  return w;
};

export default function StockMovementsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM });
  const [items, setItems] = useState<StockMovementItem[]>([{ productName: '', qty: 1, packing: 1, rate: 0, gstRate: 18, mrp: 0 }]);
  const [error, setError] = useState('');

  // Product and Warehouse stock variables linked to Inventory
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouseInventory, setWarehouseInventory] = useState<InventoryEntry[]>([]);
  const [activeItemDropdownIdx, setActiveItemDropdownIdx] = useState<number | null>(null);
  const [itemSearchText, setItemSearchText] = useState('');

  // Warehouses
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Customers for dropdown selection
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Detail modal
  const [detailMovement, setDetailMovement] = useState<StockMovement | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const handleUploadChallanDoc = async (challanId: string) => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const dataUrl = reader.result as string;
              const uploadRes = await api.uploadFile(dataUrl, file.name);
              await api.addDocument('challan', challanId, {
                name: uploadRes.name,
                url: uploadRes.url
              });
              load();
              setShowDetail(false);
            } catch (err: any) {
              alert(err.message || 'Failed to upload document');
            }
          };
          reader.readAsDataURL(file);
        } catch (err: any) {
          alert('Failed to read file');
        }
      };
      input.click();
    } else {
      Alert.prompt(
        'Attach Document',
        'Enter document or delivery proof URL:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Attach',
            onPress: async (url?: string) => {
              if (!url) return;
              try {
                await api.addDocument('challan', challanId, { name: 'Attached POD / Challan Proof', url });
                load();
                setShowDetail(false);
              } catch (err: any) {
                alert(err.message || 'Failed to attach document');
              }
            }
          }
        ]
      );
    }
  };

  const handleDeleteChallanDoc = async (challanId: string, url: string) => {
    const confirmed = Platform.OS === 'web'
      ? confirm('Are you sure you want to delete this document?')
      : await new Promise(resolve => {
          Alert.alert('Delete Document', 'Are you sure?', [
            { text: 'No', onPress: () => resolve(false) },
            { text: 'Yes, Delete', onPress: () => resolve(true) }
          ]);
        });
    if (!confirmed) return;
    try {
      await api.deleteDocument('challan', challanId, url);
      load();
      setShowDetail(false);
    } catch (err: any) {
      alert(err.message || 'Failed to delete document');
    }
  };

  // Main screen tab state
  const [topTab, setTopTab] = useState<'challans' | 'dispatches'>('challans');

  const load = useCallback(async () => {
    try {
      const data = await api.getStockMovements({
        direction: 'out',
        type: filterType || undefined,
        status: filterStatus || undefined,
        search: search || undefined,
      });
      setMovements(data);
    } catch { setMovements([]); }
  }, [filterType, filterStatus, search]);

  const loadWarehouses = useCallback(async () => {
    try {
      const w = await api.getWarehouses();
      setWarehouses(w);
      if (w.length > 0 && !form.warehouseId) {
        setForm(f => ({ ...f, warehouseId: w[0]._id, warehouseName: w[0].name }));
      }
    } catch {}
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const c = await api.getCustomers();
      setCustomers(c);
    } catch {}
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const p = await api.getProducts();
      setProducts(p);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const sub1 = DeviceEventEmitter.addListener('challan_updated_event', () => load());
    const sub2 = DeviceEventEmitter.addListener('inventory_updated_event', () => load());
    return () => {
      sub1.remove();
      sub2.remove();
    };
  }, [load]);
  useEffect(() => {
    if (showModal) {
      loadWarehouses();
      loadCustomers();
      loadProducts();
    }
  }, [showModal, loadWarehouses, loadCustomers, loadProducts]);

  // Listen for prefill_challan event from Orders screen (in-memory only — no PII in URL)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('prefill_challan', (order: any) => {
      Promise.all([loadWarehouses(), loadCustomers(), loadProducts()]).then(() => {
        setEditId(null);
        setForm(prev => ({
          ...prev,
          type: 'order',
          partyName: order.name || '',
          partyAddress: `Billing Address:\nSame as Shipping\n\nShipping Address:\n${order.shippingAddress || ''}`,
          notes: `Online Order #${order._id} | Phone: ${order.phone} | Email: ${order.email}`,
          isFree: false,
        }));
        setItems(
          (order.items || []).map((it: any) => ({
            productId: it.productId || '',
            productName: it.name || '',
            qty: it.qty || 1,
            packing: 1,
            rate: it.price || 0,
            gstRate: 18,
            mrp: it.price || 0,
            batchNo: '',
          }))
        );
        setCustomerSearch(order.name || '');
        setError('');
        setActiveItemDropdownIdx(null);
        setShowModal(true);
      });
    });
    return () => sub.remove();
  }, [loadWarehouses, loadCustomers, loadProducts]);

  useEffect(() => {
    if (form.warehouseId) {
      api.getInventoryEntries(form.warehouseId, "", true).then(res => {
        setWarehouseInventory(res);
      }).catch(err => {
        console.log('Failed to fetch warehouse inventory:', err);
      });
    } else {
      setWarehouseInventory([]);
    }
  }, [form.warehouseId]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const resetForm = () => {
    setForm({ ...DEFAULT_FORM, warehouseId: warehouses[0]?._id || '', warehouseName: warehouses[0]?.name || '' });
    setItems([{ productName: '', qty: 1, packing: 1, rate: 0, gstRate: 18, mrp: 0, size: '' }]);
    setCustomerSearch('');
    setShowCustomerDropdown(false);
    setError('');
    setActiveItemDropdownIdx(null);
    setItemSearchText('');
  };

  const getInventoryEntryDisplayName = (entry: any) => {
    const product = products.find(p => p._id === entry.productId);
    const name = product ? product.name : entry.productType || 'Unnamed Product';
    const size = entry.size || '';
    if (size && !name.toLowerCase().includes(size.toLowerCase())) {
      return `${name} (${size})`;
    }
    return name;
  };

  const getFilteredInventoryEntries = (searchText: string) => {
    const s = searchText ? searchText.toLowerCase() : '';
    
    // Group all warehouse inventory entries and master products by productId to deduplicate
    const productMap: Record<string, any> = {};

    // 1. Process warehouse inventory entries
    warehouseInventory.forEach(e => {
      if ((e.qtyBoxes || 0) <= 0) return;
      const pId = e.productId;
      const totalPcs = (e.qtyBoxes || 0) * (e.packing || 1);
      if (!productMap[pId]) {
        productMap[pId] = {
          ...e,
          totalAvailablePcs: totalPcs,
          batches: e.batchNo ? [e.batchNo] : []
        };
      } else {
        productMap[pId].totalAvailablePcs += totalPcs;
        if (e.batchNo && !productMap[pId].batches.includes(e.batchNo)) {
          productMap[pId].batches.push(e.batchNo);
        }
      }
    });

    // 2. Add products that have 0 inventory entries
    products.forEach(p => {
      if (!productMap[p._id]) {
        productMap[p._id] = {
          _id: p._id,
          productId: p._id,
          productType: p.productType || '',
          size: p.size || '',
          colour: p.colour || '',
          shape: p.shape || '',
          weight: p.weight || '',
          hsnCode: p.hsnCode || '',
          vendorId: '',
          vendorName: '',
          qtyBoxes: 0,
          packing: 1,
          warehouseId: form.warehouseId,
          warehouseName: '',
          totalAvailablePcs: 0,
          batches: []
        };
      }
    });

    const uniqueProducts = Object.values(productMap);

    if (!s) return uniqueProducts;

    return uniqueProducts.filter(entry => {
      const displayName = getInventoryEntryDisplayName(entry).toLowerCase();
      const colour = (entry.colour || '').toLowerCase();
      const shape = (entry.shape || '').toLowerCase();
      return displayName.includes(s) || colour.includes(s) || shape.includes(s);
    });
  };

  const computeBatchAllocation = (productId: string, qty: number): string => {
    if (!productId || qty <= 0) return '';
    const entries = warehouseInventory
      .filter(e => e.productId === productId && (e.qtyBoxes || 0) > 0)
      .sort((a, b) => {
        const da = a.mfgDate ? new Date(a.mfgDate).getTime() : 0;
        const db = b.mfgDate ? new Date(b.mfgDate).getTime() : 0;
        return da - db;
      });

    let needed = qty;
    const batchesUsed: string[] = [];

    for (const e of entries) {
      if (needed <= 0) break;
      const availPcs = (e.qtyBoxes || 0) * (e.packing || 1);
      if (availPcs <= 0) continue;

      const takePcs = Math.min(needed, availPcs);
      needed -= takePcs;
      batchesUsed.push(`${e.batchNo || 'NO-BATCH'} (${takePcs} Pcs)`);
    }

    return batchesUsed.length > 0 ? batchesUsed.join(', ') : '';
  };

  const handleSelectInventoryEntry = (idx: number, entry: any) => {
    const next = [...items];
    const product = products.find(p => p._id === entry.productId);
    const productMrp = product ? (product.mrp || product.price || 0) : 0;
    const basePrice = product ? (product.price || productMrp) : 0;
    const gstRate = product ? (product.gstRate || 18) : 18;

    // Check target customer default discount
    const targetCustomer = customers.find(c => c._id === form.partyId || (c.company || c.name || '').trim().toLowerCase() === form.partyName.trim().toLowerCase());
    const customerDisc = targetCustomer ? (targetCustomer.discountPercent || 0) : 0;
    const netRate = customerDisc > 0 && productMrp > 0 ? (productMrp * (1 - customerDisc / 100)) : basePrice;

    const initialQty = 1;
    const computedBatchNo = computeBatchAllocation(entry.productId, initialQty) || entry.batchNo || '';

    next[idx] = {
      productId: entry.productId,
      productName: getInventoryEntryDisplayName(entry),
      qty: initialQty,
      packing: entry.packing || 1,
      mrp: productMrp,
      discountPercent: customerDisc,
      rate: netRate,
      gstRate,
      batchNo: computedBatchNo,
      size: entry.size || '',
    };
    setItems(next);
    setActiveItemDropdownIdx(null);
  };

  const handleSave = async () => {
    if (form.type === 'sale' && !form.partyId) {
      setError('Please select a registered customer from the list.');
      return;
    }
    if (form.type !== 'damage' && !form.partyName.trim()) {
      setError('Please enter party name.');
      return;
    }
    if (form.type === 'damage') {
      setForm(f => ({ ...f, partyName: 'Damage' }));
    }
    if (items.some(i => !i.productName.trim())) {
      setError('All items must have a product name.');
      return;
    }
    if (!form.warehouseId) {
      setError('Warehouse is required.');
      return;
    }

    for (const item of items) {
      if (item.productId) {
        const availPcs = warehouseInventory
          .filter(e => e.productId === item.productId)
          .reduce((s, e) => s + ((e.qtyBoxes || 0) * (e.packing || 1)), 0);
        if (availPcs > 0 && (item.qty || 0) > availPcs) {
          setError(`Quantity for ${item.productName} (${item.qty} pcs) exceeds available warehouse stock (${availPcs} pcs).`);
          return;
        }
      }
    }

    const payload = {
      ...form,
      items: items.map(it => ({
        productId: it.productId,
        productName: it.productName,
        qty: it.qty,
        packing: it.packing || 1,
        rate: form.type === 'sample' ? 0 : (it.rate || 0),
        discountPercent: form.type === 'sample' ? 0 : (it.discountPercent || 0),
        gstRate: (form.type === 'sample' || (form as any).billingMode === 'cash') ? 0 : (it.gstRate || 0),
        batchNo: it.batchNo || '',
        mrp: it.mrp || 0,
        hsnCode: it.hsnCode || '',
      })),
      status: 'draft',
      baseAmount: showFinancials ? totalBase : 0,
      totalMrp: showFinancials ? totalMrpValue : 0,
      totalDiscount: showFinancials ? totalDiscountSaved : 0,
      cgst,
      sgst,
      igst,
      roundOff,
      totalAmount: showFinancials ? nettTotal : 0,
    };

    try {
      if (editId) {
        await api.updateStockMovement(editId, payload);
      } else {
        await api.createStockMovement(payload);
      }
      // Reload warehouse inventory entries in state to reflect the transaction without requiring manual reload
      if (form.warehouseId) {
        const updatedInventory = await api.getInventoryEntries(form.warehouseId, "", true);
        setWarehouseInventory(updatedInventory);
      }
      setShowModal(false);
      resetForm();
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleConvertToInvoice = async (id: string) => {
    try {
      const result = await api.convertStockMovementToInvoice(id);
      if (Platform.OS === 'web') window.alert(`Draft GST Invoice ${result.invoice.invoiceNo} created successfully! You can review and edit it under Tax Invoices.`);
      load();
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message);
    }
  };

  const handleCancel = async (id: string) => {
    const ok = Platform.OS === 'web'
      ? window.confirm('Cancel this challan? Inventory & customer balance will be reverted.')
      : await new Promise(r => Alert.alert('Cancel', 'Cancel this challan? Inventory & customer balance will be reverted.', [
          { text: 'No', onPress: () => r(false) },
          { text: 'Yes', style: 'destructive', onPress: () => r(true) }
        ]));
    if (!ok) return;
    try {
      await api.cancelStockMovement(id);
      if (form.warehouseId) {
        const updatedInventory = await api.getInventoryEntries(form.warehouseId, "", true);
        setWarehouseInventory(updatedInventory);
      }
      load();
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = Platform.OS === 'web'
      ? window.confirm('Delete this challan?')
      : await new Promise(r => Alert.alert('Delete', 'Delete this challan?', [
          { text: 'No', onPress: () => r(false) },
          { text: 'Delete', style: 'destructive', onPress: () => r(true) }
        ]));
    if (!ok) return;
    try {
      await api.deleteStockMovement(id);
      if (form.warehouseId) {
        const updatedInventory = await api.getInventoryEntries(form.warehouseId, "", true);
        setWarehouseInventory(updatedInventory);
      }
      load();
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message);
    }
  };

  const handleFinalize = async (m: StockMovement) => {
    const ok = Platform.OS === 'web'
      ? window.confirm(`Finalize this challan? This will post the transactions and ${m.direction === 'out' ? 'deduct' : 'increase'} stock inventory.`)
      : await new Promise(r => Alert.alert('Finalize', `Finalize this challan? This will post the transactions and ${m.direction === 'out' ? 'deduct' : 'increase'} stock inventory.`, [
          { text: 'No', onPress: () => r(false) },
          { text: 'Yes', onPress: () => r(true) }
        ]));
    if (!ok) return;
    try {
      if (m.direction === 'out') {
        await api.dispatchStockMovement(m._id);
      } else {
        await api.receiveStockMovement(m._id);
      }
      if (form.warehouseId) {
        const updatedInventory = await api.getInventoryEntries(form.warehouseId, "", true);
        setWarehouseInventory(updatedInventory);
      }
      if (Platform.OS === 'web') window.alert('Challan finalized successfully!');
      load();
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message);
    }
  };

  const availableTypes = Object.entries(TYPE_CONFIG);
  const isSale = form.type === 'sale';
  const isSample = form.type === 'sample';
  const isDamage = form.type === 'damage';
  const isTransfer = form.type === 'transfer_out';

  // Calculate Totals and Bifurcation
  const isCash = (form as any).billingMode === 'cash';
  let totalMrpValue = 0;
  let totalDiscountSaved = 0;
  let totalBase = 0;
  let totalTax = 0;
  items.forEach(it => {
    if (it.productName.trim() !== '') {
      const totalPcs = (it.qty || 0) * (it.packing || 1);
      const mrpRate = it.mrp || 0;
      const netRate = it.rate || 0;

      const itemMrpTotal = mrpRate > 0 ? (totalPcs * mrpRate) : (totalPcs * netRate);
      const itemBase = totalPcs * netRate;
      const itemDiscount = Math.max(0, itemMrpTotal - itemBase);

      totalMrpValue += itemMrpTotal;
      totalDiscountSaved += itemDiscount;
      totalBase += itemBase;

      const gst = isCash ? 0 : (it.gstRate || 0);
      totalTax += (itemBase * gst) / 100;
    }
  });

  const isIntraState = (form.partyGstin || '').startsWith('09') || !form.partyGstin;
  const showFinancials = (form.type === 'sale' || form.type === 'order' || form.type === 'damage') && !form.isFree;
  
  const cgst = showFinancials && !isCash && isIntraState ? totalTax / 2 : 0;
  const sgst = showFinancials && !isCash && isIntraState ? totalTax / 2 : 0;
  const igst = showFinancials && !isCash && !isIntraState ? totalTax : 0;
  const rawTotal = showFinancials ? (totalBase + cgst + sgst + igst) : 0;
  const nettTotal = Math.round(rawTotal);
  const roundOff = nettTotal - rawTotal;



  // ── Inline Form View (replaces Modal) ──────────────────────────────────────
  if (showModal) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screen}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => { setShowModal(false); resetForm(); }}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{editId ? 'Edit Delivery Challan' : 'New Delivery Challan'}</Text>
          <TouchableOpacity onPress={handleSave}>
            <Ionicons name="checkmark-circle" size={26} color={colors.success} />
          </TouchableOpacity>
        </View>
        {error ? <Text style={styles.modalError}>{error}</Text> : null}
        <ScrollView style={styles.modalForm} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16 }}>
            <Pressable onPress={() => { setShowCustomerDropdown(false); setActiveItemDropdownIdx(null); setShowDatePicker(false); }} style={{ flex: 1 }}>
              {/* Card Section 1: General Details */}
              <View style={{ backgroundColor: colors.bg.secondary, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border, zIndex: showDatePicker ? 5000 : 100, overflow: 'visible' }}>
                <Text style={[styles.inputLabel, { color: colors.primary, fontSize: 13, marginBottom: 8 }]}>📋 Document Details</Text>
                
                {/* Movement Type + Warehouse + Date — single row */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12, zIndex: showDatePicker ? 5100 : 10, overflow: 'visible' }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.inputLabel}>Movement Type *</Text>
                    {Platform.OS === 'web' ? (
                      <select value={form.type} onChange={(e: any) => {
                        const key = e.target.value;
                        setForm(f => ({ ...f, type: key, medicalRepName: key === 'sample' ? (user?.name || '') : f.medicalRepName, partyName: key === 'damage' ? 'Damage' : f.partyName }));
                      }} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, backgroundColor: colors.bg.primary, color: colors.text.primary, fontSize: 13, height: 35, width: '100%', outline: 'none', boxSizing: 'border-box' }}>
                        {availableTypes.map(([key, conf]) => (
                          <option key={key} value={key}>{conf.label}</option>
                        ))}
                      </select>
                    ) : (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                        {availableTypes.map(([key, conf]) => (
                          <TouchableOpacity key={key}
                            style={[styles.toggleChip, form.type === key && { backgroundColor: conf.color, borderColor: conf.color }]}
                            onPress={() => setForm(f => ({ ...f, type: key, medicalRepName: key === 'sample' ? (user?.name || '') : f.medicalRepName, partyName: key === 'damage' ? 'Damage' : f.partyName }))}>
                            <Text style={[styles.toggleChipText, form.type === key && { color: '#fff', fontWeight: '700' }]}>{conf.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.inputLabel}>Source Warehouse *</Text>
                    {Platform.OS === 'web' ? (
                      <select value={form.warehouseId} onChange={(e: any) => {
                        const w = warehouses.find(x => x._id === e.target.value);
                        setForm(f => ({ ...f, warehouseId: e.target.value, warehouseName: w?.name || '' }));
                      }} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, backgroundColor: colors.bg.primary, color: colors.text.primary, fontSize: 13, height: 35, width: '100%', outline: 'none', boxSizing: 'border-box' }}>
                        <option value="">Select Warehouse</option>
                        {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                      </select>
                    ) : (
                      <TextInput style={[styles.input, { height: 35, backgroundColor: colors.bg.primary }]} value={form.warehouseName} onChangeText={v => setForm(f => ({ ...f, warehouseName: v }))} placeholder="Warehouse" placeholderTextColor={colors.text.muted} />
                    )}
                  </View>
                  <View style={{ flex: 0.8, minWidth: 0, zIndex: showDatePicker ? 3000 : 100, position: 'relative' }}>
                    <Text style={styles.inputLabel}>Date *</Text>
                    <View style={styles.customSearchSelectContainer}>
                      <TouchableOpacity 
                        style={[styles.input, { height: 35, justifyContent: 'center', cursor: 'pointer', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 0 } as any]}
                        onPress={() => setShowDatePicker(!showDatePicker)}
                      >
                        <Ionicons name="calendar-outline" size={14} color={colors.text.muted} />
                        <Text style={{ flex: 1, color: colors.text.primary, fontWeight: '700', fontSize: 13 }}>
                          {form.date ? new Date(form.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Select Date'}
                        </Text>
                        <Ionicons name={showDatePicker ? "chevron-up" : "chevron-down"} size={14} color={colors.text.muted} />
                      </TouchableOpacity>

                      {showDatePicker && (() => {
                        const currentDateObj = form.date ? new Date(form.date) : new Date();
                        const year = currentDateObj.getFullYear();
                        const month = currentDateObj.getMonth();

                        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                        const daysInMonth = new Date(year, month + 1, 0).getDate();
                        const firstDayIndex = new Date(year, month, 1).getDay();

                        const calendarDays = [];
                        for (let i = 0; i < firstDayIndex; i++) {
                          calendarDays.push(null);
                        }
                        for (let d = 1; d <= daysInMonth; d++) {
                          calendarDays.push(d);
                        }

                        const handleMonthChange = (offset: number) => {
                          const newDate = new Date(year, month + offset, 1);
                          const formatted = newDate.toISOString().split('T')[0];
                          setForm(f => ({ ...f, date: formatted }));
                        };

                        const handleSelectDay = (day: number) => {
                          const selected = new Date(year, month, day);
                          const yyyy = selected.getFullYear();
                          const mm = String(selected.getMonth() + 1).padStart(2, '0');
                          const dd = String(selected.getDate()).padStart(2, '0');
                          setForm(f => ({ ...f, date: `${yyyy}-${mm}-${dd}` }));
                          setShowDatePicker(false);
                        };

                        return (
                          <View style={[styles.customSelectPanel, { 
                            padding: 14, 
                            width: '100%', 
                            left: 0, 
                            right: 0,
                            backgroundColor: colors.bg.card,
                            borderRadius: Radius.lg,
                            borderWidth: 1,
                            borderColor: colors.border,
                            boxShadow: '0px 10px 25px rgba(0,0,0,0.15)',
                            elevation: 10,
                            top: 40,
                            position: 'absolute',
                            zIndex: 4000
                          }]}>
                            {/* Calendar Header */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                              <TouchableOpacity onPress={() => handleMonthChange(-1)} style={{ padding: 4, borderRadius: 4, backgroundColor: colors.bg.secondary }}>
                                <Ionicons name="chevron-back" size={14} color={colors.text.primary} />
                              </TouchableOpacity>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text.primary }}>
                                {monthNames[month]} {year}
                              </Text>
                              <TouchableOpacity onPress={() => handleMonthChange(1)} style={{ padding: 4, borderRadius: 4, backgroundColor: colors.bg.secondary }}>
                                <Ionicons name="chevron-forward" size={14} color={colors.text.primary} />
                              </TouchableOpacity>
                            </View>

                            {/* Weekday Labels */}
                            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(w => (
                                <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: 9, fontWeight: '800', color: colors.text.muted }}>{w}</Text>
                              ))}
                            </View>

                            {/* Day Grid */}
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                              {calendarDays.map((dayNum, i) => {
                                if (dayNum === null) {
                                  return <View key={`empty-${i}`} style={{ width: '14.28%', height: 26 }} />;
                                }
                                const isSelected = form.date && new Date(form.date).getDate() === dayNum && new Date(form.date).getMonth() === month && new Date(form.date).getFullYear() === year;
                                const isToday = new Date().getDate() === dayNum && new Date().getMonth() === month && new Date().getFullYear() === year;

                                return (
                                  <TouchableOpacity
                                    key={`day-${dayNum}`}
                                    style={[{
                                      width: '14.28%',
                                      height: 26,
                                      justifyContent: 'center',
                                      alignItems: 'center',
                                      borderRadius: 6
                                    }, isSelected && { backgroundColor: colors.primary }, isToday && !isSelected && { borderWidth: 1, borderColor: colors.primary }]}
                                    onPress={() => handleSelectDay(dayNum)}
                                  >
                                    <Text style={[{ fontSize: 11, fontWeight: isSelected || isToday ? '800' : '500', color: isSelected ? '#fff' : colors.text.primary }]}>
                                      {dayNum}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>

                            {/* Today Quick Select Footer */}
                            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 10, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <TouchableOpacity onPress={() => { setForm(f => ({ ...f, date: new Date().toISOString().split('T')[0] })); setShowDatePicker(false); }}>
                                <Text style={{ fontSize: 10, fontWeight: '800', color: colors.primary }}>Today</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted }}>Close</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })()}
                    </View>
                  </View>
                </View>

                {/* Notes */}
                <Text style={styles.inputLabel}>Notes</Text>
                <TextInput style={[styles.input, { height: 38, textAlignVertical: 'top', backgroundColor: colors.bg.primary, marginBottom: 2 }]} value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} placeholder="Optional notes..." placeholderTextColor={colors.text.muted} multiline />
              </View>

              {/* Card Section 2: Party / Target Details */}
              <View style={{ backgroundColor: colors.bg.secondary, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                <Text style={[styles.inputLabel, { color: colors.primary, fontSize: 13, marginBottom: 8 }]}>👤 Party / Clinic Information</Text>

                {/* Billing Mode (sale only) */}
                {isSale && (() => {
                  const selectedCustomer = customers.find(c => c._id === form.partyId);
                  const isCashCust = selectedCustomer && (selectedCustomer.customerType === 'cash' || selectedCustomer.recordTracking === 'cash_ledger');

                  return (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={styles.inputLabel}>Billing Mode *</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        <TouchableOpacity
                          style={[
                            styles.toggleChip,
                            form.billingMode === 'regular' && { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
                            isCashCust && { opacity: 0.4 }
                          ]}
                          disabled={isCashCust}
                          onPress={() => setForm(f => ({ ...f, billingMode: 'regular' }))}
                        >
                          <Text style={[styles.toggleChipText, form.billingMode === 'regular' && { color: '#fff', fontWeight: '700' }]}>
                            Regular (GST Invoice) {isCashCust ? '(Disabled for Non-GST)' : ''}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.toggleChip, form.billingMode === 'cash' && { backgroundColor: '#f59e0b', borderColor: '#f59e0b' }]}
                          onPress={() => setForm(f => ({ ...f, billingMode: 'cash' }))}
                        >
                          <Text style={[styles.toggleChipText, form.billingMode === 'cash' && { color: '#fff', fontWeight: '700' }]}>Cash (No GST)</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })()}

                {/* Sample-specific fields (MR and Doctor Name Side-by-Side) */}
                {isSample && (
                  <View style={{ backgroundColor: colors.bg.primary, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 11, color: '#7c3aed', marginBottom: 8, fontWeight: '700' }}>🩺 Doctor Sample — NOT a taxable supply.</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inputLabel}>MR Name</Text>
                        <TextInput style={[styles.input, { height: 35, backgroundColor: colors.bg.secondary, color: colors.text.muted, marginBottom: 0 }]} value={form.medicalRepName} editable={false} placeholder="MR Name" placeholderTextColor={colors.text.muted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inputLabel}>Doctor Name</Text>
                        <TextInput style={[styles.input, { height: 35, backgroundColor: colors.bg.secondary, marginBottom: 0 }]} value={form.doctorName} onChangeText={v => setForm(f => ({ ...f, doctorName: v }))} placeholder="Dr. Name" placeholderTextColor={colors.text.muted} />
                      </View>
                    </View>
                  </View>
                )}

                {/* Damage-specific fields */}
                {isDamage && (
                  <View style={{ backgroundColor: '#fff1f2', borderRadius: 10, padding: 12, marginBottom: 2, borderWidth: 1, borderColor: '#fecdd3' }}>
                    <Text style={{ fontSize: 11, color: '#be123c', marginBottom: 8, fontWeight: '700' }}>⚠️ Damage Write-off — Deducts inventory only.</Text>
                    <Text style={styles.inputLabel}>Damage Reason *</Text>
                    <TextInput style={[styles.input, { height: 50, textAlignVertical: 'top', backgroundColor: colors.bg.secondary, marginBottom: 0 }]} value={form.damageReason} onChangeText={v => setForm(f => ({ ...f, damageReason: v }))} placeholder="Describe the damage..." placeholderTextColor={colors.text.muted} multiline />
                  </View>
                )}

                 {/* Transfer-specific fields */}
                {isTransfer && (
                  <View style={{ backgroundColor: colors.bg.primary, borderRadius: 10, padding: 12, marginBottom: 2, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 11, color: '#f59e0b', marginBottom: 8, fontWeight: '700' }}>🔄 Stock Transfer — Outward movement to another warehouse/unit.</Text>
                    <Text style={styles.inputLabel}>Destination Warehouse / Unit *</Text>
                    {Platform.OS === 'web' ? (
                      <select
                        value={form.partyId || ''}
                        onChange={(e: any) => {
                          const w = warehouses.find(x => x._id === e.target.value);
                          setForm(f => ({
                            ...f,
                            partyId: e.target.value,
                            partyName: w?.name || '',
                            partyAddress: w ? `Warehouse Address:\n${w.name}` : ''
                          }));
                        }}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: `1px solid ${colors.border}`,
                          backgroundColor: colors.bg.secondary,
                          color: colors.text.primary,
                          fontSize: 13,
                          height: 35,
                          width: '100%',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      >
                        <option value="">Select Destination Warehouse</option>
                        {warehouses
                          .filter(w => w._id !== form.warehouseId)
                          .map(w => (
                            <option key={w._id} value={w._id}>{w.name}</option>
                          ))
                        }
                      </select>
                    ) : (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {warehouses
                          .filter(w => w._id !== form.warehouseId)
                          .map(w => (
                            <TouchableOpacity
                              key={w._id}
                              style={[
                                styles.toggleChip,
                                form.partyId === w._id && { backgroundColor: '#f59e0b', borderColor: '#f59e0b' }
                              ]}
                              onPress={() => {
                                setForm(f => ({
                                  ...f,
                                  partyId: w._id,
                                  partyName: w.name,
                                  partyAddress: `Warehouse Address:\n${w.name}`
                                }));
                              }}
                            >
                              <Text style={[styles.toggleChipText, form.partyId === w._id && { color: '#fff', fontWeight: '700' }]}>
                                {w.name}
                              </Text>
                            </TouchableOpacity>
                          ))
                        }
                      </View>
                    )}
                  </View>
                )}

                {/* Party Information (dropdown fetched from customers) */}
                {(isDamage || (!isDamage && !isTransfer)) && (
                  <View style={{ zIndex: 1000, position: 'relative' }}>
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10, zIndex: 1001, position: 'relative' }}>
                      <View style={{ flex: 1.2, position: 'relative', zIndex: 1002 }}>
                        <Text style={styles.inputLabel}>{isDamage ? 'Party (auto-set)' : isSample ? 'Party / Clinic (optional)' : 'Party Name *'}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, height: 35, backgroundColor: colors.bg.primary, marginBottom: 2 }}>
                          <Ionicons name="person-outline" size={14} color={colors.text.muted} />
                          <TextInput
                            style={{ flex: 1, fontSize: 13, color: colors.text.primary, height: '100%', paddingLeft: 6 }}
                            value={isDamage ? form.partyName || 'Damage' : customerSearch}
                            editable={!isDamage}
                            onChangeText={v => {
                              setCustomerSearch(v);
                              setForm(f => ({ ...f, partyName: v, partyId: '' }));
                              setShowCustomerDropdown(true);
                            }}
                            onFocus={() => !isDamage && setShowCustomerDropdown(true)}
                            placeholder={isDamage ? 'Damage' : "Search customer..."}
                            placeholderTextColor={colors.text.muted}
                          />
                          {!isDamage && customerSearch ? (
                            <TouchableOpacity onPress={() => { setCustomerSearch(''); setForm(f => ({ ...f, partyName: '', partyId: '' })); setShowCustomerDropdown(true); }}>
                              <Ionicons name="close-circle" size={16} color={colors.text.muted} style={{ paddingLeft: 6 }} />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                        {showCustomerDropdown && (
                          <View style={styles.customSelectPanel}>
                            <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                              {customers
                                .filter(c =>
                                  !customerSearch.trim() ||
                                  c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                                  (c.company && c.company.toLowerCase().includes(customerSearch.toLowerCase()))
                                )
                                .slice(0, 8)
                                .map(c => {
                                  const displayName = c.company ? `${c.company} (${c.name})` : c.name;
                                  const hasGst = !!(c.gstin && c.gstin.trim());
                                  return (
                                    <TouchableOpacity
                                      key={c._id}
                                      style={styles.customSelectItem}
                                      onPress={() => {
                                        const finalName = c.company || c.name;
                                        const billingAddr = c.billingAddress;
                                        const billingAddrStr = billingAddr ? [billingAddr.street, billingAddr.city, billingAddr.state, billingAddr.pin].filter(Boolean).join(', ') : '';
                                        const shippingAddr = c.shippingAddress;
                                        const shippingAddrStr = shippingAddr ? [shippingAddr.street, shippingAddr.city, shippingAddr.state, shippingAddr.pin].filter(Boolean).join(', ') : (billingAddrStr.trim());
                                        setForm(f => ({
                                          ...f,
                                          partyId: c._id,
                                          partyName: finalName,
                                          partyGstin: c.gstin || '',
                                          billingAddress: billingAddrStr.trim(),
                                          shippingAddress: shippingAddrStr.trim(),
                                          partyAddress: `Billing Address:\n${billingAddrStr.trim()}\n\nShipping Address:\n${shippingAddrStr.trim()}`
                                        }));
                                        setCustomerSearch(finalName);
                                        setShowCustomerDropdown(false);
                                      }}
                                    >
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <View style={{ flex: 1, paddingRight: 8 }}>
                                          <Text style={styles.customSelectItemText}>{displayName}</Text>
                                          {c.phone ? <Text style={styles.customSelectItemSubtext}>📞 {c.phone}</Text> : null}
                                        </View>
                                        {hasGst ? (
                                          <View style={{ backgroundColor: colors.success + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 0.5, borderColor: colors.success }}>
                                            <Text style={{ fontSize: 9, fontWeight: '700', color: colors.success }}>📄 GST ({c.gstin})</Text>
                                          </View>
                                        ) : (
                                          <View style={{ backgroundColor: colors.warning + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 0.5, borderColor: colors.warning }}>
                                            <Text style={{ fontSize: 9, fontWeight: '700', color: colors.warning }}>💵 Cash</Text>
                                          </View>
                                        )}
                                      </View>
                                    </TouchableOpacity>
                                  );
                                })
                              }
                              {customers.filter(c =>
                                c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                                (c.company && c.company.toLowerCase().includes(customerSearch.toLowerCase()))
                              ).length === 0 && (
                                <View style={{ padding: 12 }}>
                                  <Text style={{ fontSize: 12, color: colors.text.secondary, textAlign: 'center' }}>
                                    {isSale ? 'No registered customers found.' : 'No customers found (typing custom clinic).'}
                                  </Text>
                                </View>
                              )}
                            </ScrollView>
                          </View>
                        )}
                      </View>
                      {(isSale && form.billingMode === 'regular') && (
                        <View style={{ flex: 0.8 }}>
                          <Text style={styles.inputLabel}>Party GSTIN</Text>
                          <TextInput style={[styles.input, { height: 35, backgroundColor: colors.bg.secondary, color: colors.text.muted }]} value={form.partyGstin} editable={false} placeholder="GSTIN" placeholderTextColor={colors.text.muted} autoCapitalize="characters" />
                        </View>
                      )}
                    </View>

                    {/* Side-by-side Billing & Shipping Address Fields */}
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 2 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inputLabel}>Billing Address</Text>
                        <TextInput
                          style={[styles.input, { height: 60, textAlignVertical: 'top', backgroundColor: colors.bg.secondary, color: colors.text.muted, marginBottom: 0 }]}
                          value={form.billingAddress}
                          editable={false}
                          placeholder="No Billing Address specified"
                          placeholderTextColor={colors.text.muted}
                          multiline
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inputLabel}>Shipping Address</Text>
                        <TextInput
                          style={[styles.input, { height: 60, textAlignVertical: 'top', backgroundColor: colors.bg.primary, marginBottom: 0 }]}
                          value={form.shippingAddress}
                          onChangeText={v => setForm(f => {
                            const newForm = { ...f, shippingAddress: v };
                            newForm.partyAddress = `Billing Address:\n${newForm.billingAddress}\n\nShipping Address:\n${v}`;
                            return newForm;
                          })}
                          placeholder="Enter Shipping Address..."
                          placeholderTextColor={colors.text.muted}
                          multiline
                        />
                      </View>
                    </View>
                  </View>
                )}
              </View>

              {/* Card Section 3: Logistics & Transport Details */}
              <View style={{ backgroundColor: colors.bg.secondary, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                <Text style={[styles.inputLabel, { color: colors.primary, fontSize: 13, marginBottom: 10 }]}>🚚 Logistics &amp; Transport Details (Optional)</Text>
                
                {/* Row 1: Transporter, LR/GR, Vehicle */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.inputLabel}>Transporter Name</Text>
                    <TextInput style={[styles.input, { height: 38, paddingVertical: 0, backgroundColor: colors.bg.primary, marginBottom: 0 }]} value={form.transporter || ''} onChangeText={v => setForm(f => ({ ...f, transporter: v }))} placeholder="e.g. VRL, TCI" placeholderTextColor={colors.text.muted} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.inputLabel}>LR / GR Number</Text>
                    <TextInput style={[styles.input, { height: 38, paddingVertical: 0, backgroundColor: colors.bg.primary, marginBottom: 0 }]} value={form.lrNo || ''} onChangeText={v => setForm(f => ({ ...f, lrNo: v }))} placeholder="Lorry Receipt No" placeholderTextColor={colors.text.muted} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.inputLabel}>Vehicle Number</Text>
                    <TextInput style={[styles.input, { height: 38, paddingVertical: 0, backgroundColor: colors.bg.primary, marginBottom: 0 }]} value={form.vehicleNo || ''} onChangeText={v => setForm(f => ({ ...f, vehicleNo: v }))} placeholder="e.g. MH-12-AB-1234" placeholderTextColor={colors.text.muted} />
                  </View>
                </View>

                {/* Row 2: Courier Service, Tracking ID, Total Boxes */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.inputLabel}>Courier Service</Text>
                    <TextInput style={[styles.input, { height: 38, paddingVertical: 0, backgroundColor: colors.bg.primary, marginBottom: 0 }]} value={form.courierName || ''} onChangeText={v => setForm(f => ({ ...f, courierName: v }))} placeholder="e.g. Delhivery, BlueDart" placeholderTextColor={colors.text.muted} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.inputLabel}>Tracking ID</Text>
                    <TextInput style={[styles.input, { height: 38, paddingVertical: 0, backgroundColor: colors.bg.primary, marginBottom: 0 }]} value={form.trackingId || ''} onChangeText={v => setForm(f => ({ ...f, trackingId: v }))} placeholder="Tracking Number" placeholderTextColor={colors.text.muted} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.inputLabel}>Total Boxes</Text>
                    <TextInput style={[styles.input, { height: 38, paddingVertical: 0, backgroundColor: colors.bg.primary, marginBottom: 0 }]} value={form.totalBoxes || '1'} onChangeText={v => setForm(f => ({ ...f, totalBoxes: v }))} keyboardType="numeric" placeholder="1" placeholderTextColor={colors.text.muted} />
                  </View>
                </View>
              </View>

              {/* Card Section 4: Dispatched Products */}
              <View style={{ backgroundColor: colors.bg.secondary, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border, overflow: 'visible' }}>
                <Text style={[styles.inputLabel, { color: colors.primary, fontSize: 13, marginBottom: 8 }]}>📦 Dispatched Products</Text>
                
                {items.map((item, idx) => {
                  const isDropdownOpen = activeItemDropdownIdx === idx;
                  const filtered = getFilteredInventoryEntries(isDropdownOpen ? itemSearchText : '');
                  return (
                    <View key={idx} style={{ marginBottom: 10, padding: 10, borderRadius: 8, backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border }}>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <View style={{ flex: 3.5, minWidth: 160 }}>
                          <Text style={styles.fieldLabel}>Product Name</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: isDropdownOpen ? colors.primary : colors.border, borderRadius: 8, paddingHorizontal: 10, height: 32, backgroundColor: colors.bg.secondary }}>
                            <Ionicons name="cube-outline" size={14} color={colors.text.muted} />
                            <TextInput
                              style={{ flex: 1, fontSize: 13, color: colors.text.primary, height: '100%', paddingLeft: 6 }}
                              value={item.productName}
                              onChangeText={v => {
                                const n = [...items]; n[idx].productName = v;
                                setItems(n);
                                setItemSearchText(v);
                                setActiveItemDropdownIdx(idx);
                              }}
                              onFocus={() => {
                                setActiveItemDropdownIdx(idx);
                                setItemSearchText(item.productName);
                              }}
                              placeholder="Search product..."
                              placeholderTextColor={colors.text.muted}
                            />
                            {item.productName ? (
                                <TouchableOpacity onPress={() => {
                                const n = [...items];
                                n[idx] = { productName: '', qty: 1, packing: 1, rate: 0, gstRate: 18, mrp: 0, size: '' };
                                setItems(n);
                                setItemSearchText('');
                                setActiveItemDropdownIdx(idx);
                              }}>
                                <Ionicons name="close-circle" size={16} color={colors.text.muted} style={{ paddingLeft: 6 }} />
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>

                        <View style={{ flex: 1, minWidth: 60 }}>
                          <Text style={styles.fieldLabel}>Qty (pcs)</Text>
                          <TextInput style={[styles.smallInput, { height: 32 }]} value={String(item.qty)} onChangeText={v => {
                            let newQty = parseInt(v) || 0;
                            if (item.productId) {
                              const availPcs = warehouseInventory
                                .filter(e => e.productId === item.productId)
                                .reduce((s, e) => s + ((e.qtyBoxes || 0) * (e.packing || 1)), 0);
                              if (availPcs > 0 && newQty > availPcs) {
                                alert(`Cannot enter quantity (${newQty} pcs) exceeding available stock (${availPcs} pcs). Quantity capped to ${availPcs} pcs.`);
                                newQty = availPcs;
                              }
                            }
                            const n = [...items];
                            n[idx].qty = newQty;
                            if (item.productId) {
                              n[idx].batchNo = computeBatchAllocation(item.productId, newQty);
                            }
                            setItems(n);
                          }} keyboardType="numeric" />
                        </View>

                        {!isSample && (
                          <>
                            <View style={{ flex: 1.1, minWidth: 70 }}>
                              <Text style={styles.fieldLabel}>MRP (₹)</Text>
                              <TextInput style={[styles.smallInput, { height: 32 }]} value={String(item.mrp || 0)} onChangeText={v => {
                                const n = [...items];
                                const mrpVal = parseFloat(v) || 0;
                                n[idx].mrp = mrpVal;
                                const disc = n[idx].discountPercent || 0;
                                const computedRate = mrpVal > 0 ? (disc > 0 ? mrpVal * (1 - disc / 100) : mrpVal) : (n[idx].rate || 0);
                                n[idx].rate = computedRate;
                                setItems(n);
                              }} keyboardType="numeric" />
                            </View>

                            <View style={{ flex: 0.9, minWidth: 60 }}>
                              <Text style={styles.fieldLabel}>Disc (%)</Text>
                              <TextInput style={[styles.smallInput, { height: 32 }]} value={String(item.discountPercent || 0)} onChangeText={v => {
                                const n = [...items];
                                const discVal = parseFloat(v) || 0;
                                n[idx].discountPercent = discVal;
                                const mrpVal = n[idx].mrp || n[idx].rate || 0;
                                const computedRate = mrpVal > 0 ? mrpVal * (1 - discVal / 100) : (n[idx].rate || 0);
                                n[idx].rate = computedRate;
                                setItems(n);
                              }} keyboardType="numeric" />
                            </View>

                            <View style={{ flex: 1.1, minWidth: 75 }}>
                              <Text style={styles.fieldLabel}>Net Rate (₹)</Text>
                              <TextInput style={[styles.smallInput, { height: 32 }]} value={String(item.rate || 0)} onChangeText={v => {
                                const n = [...items];
                                const netRate = parseFloat(v) || 0;
                                n[idx].rate = netRate;
                                const mrpVal = n[idx].mrp || 0;
                                if (mrpVal > 0 && mrpVal >= netRate) {
                                  n[idx].discountPercent = parseFloat((((mrpVal - netRate) / mrpVal) * 100).toFixed(1));
                                }
                                setItems(n);
                              }} keyboardType="numeric" />
                            </View>
                          </>
                        )}

                        {isSale && (form as any).billingMode !== 'cash' && !form.isFree && (
                          <View style={{ flex: 1, minWidth: 60 }}>
                            <Text style={styles.fieldLabel}>GST %</Text>
                            <TextInput style={[styles.smallInput, { height: 32 }]} value={String(item.gstRate || 0)} onChangeText={v => { const n = [...items]; n[idx].gstRate = parseFloat(v) || 0; setItems(n); }} keyboardType="numeric" />
                          </View>
                        )}

                        {items.length > 1 && (
                          <TouchableOpacity style={{ marginBottom: 6 }} onPress={() => { setItems(items.filter((_, i) => i !== idx)); setActiveItemDropdownIdx(null); }}>
                            <Ionicons name="trash-outline" size={18} color={colors.danger} />
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Inline dropdown — no absolute positioning, never clipped by ScrollView */}
                      {isDropdownOpen && filtered.length > 0 && (() => {
                        const selectedOtherProductIds = items
                          .filter((_, i) => i !== idx && _.productId)
                          .map(_ => _.productId);
                        const allowedFiltered = filtered.filter(entry => !selectedOtherProductIds.includes(entry.productId));
                        
                        if (allowedFiltered.length === 0) return null;

                        return (
                          <View style={{ backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.primary, borderRadius: 8, marginBottom: 8, marginTop: 8, overflow: 'hidden' }}>
                            <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                              {allowedFiltered.slice(0, 10).map(entry => {
                                const displayName = getInventoryEntryDisplayName(entry);
                                const availPcs = entry.totalAvailablePcs !== undefined ? entry.totalAvailablePcs : entry.qtyBoxes * (entry.packing || 1);
                                const batchStr = entry.batches?.length > 0 ? entry.batches[0] : (entry.batchNo || 'N/A');
                                return (
                                  <TouchableOpacity key={entry._id} style={styles.customSelectItem}
                                    onPress={() => handleSelectInventoryEntry(idx, entry)}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <View style={{ flex: 1, paddingRight: 8 }}>
                                        <Text style={styles.customSelectItemText}>{displayName}</Text>
                                        <Text style={styles.customSelectItemSubtext}>
                                          Available: {availPcs} pcs {batchStr !== 'N/A' ? `| Batch: ${batchStr}` : ''}
                                        </Text>
                                      </View>
                                      {availPcs > 0 ? (
                                        <View style={{ backgroundColor: colors.success + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 0.5, borderColor: colors.success }}>
                                          <Text style={{ fontSize: 9, fontWeight: '700', color: colors.success }}>📦 In Stock</Text>
                                        </View>
                                      ) : (
                                        <View style={{ backgroundColor: colors.danger + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 0.5, borderColor: colors.danger }}>
                                          <Text style={{ fontSize: 9, fontWeight: '700', color: colors.danger }}>⚠️ Out of Stock</Text>
                                        </View>
                                      )}
                                    </View>
                                  </TouchableOpacity>
                                );
                              })}
                            </ScrollView>
                          </View>
                        );
                      })()}
                    </View>
                  );
                })}
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: 8, paddingVertical: 10, marginTop: 4, marginBottom: 6 }} onPress={() => setItems([...items, { productName: '', qty: 1, packing: 1, rate: 0, gstRate: 18, mrp: 0, size: '' }])}>
                  <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Add Product Row</Text>
                </TouchableOpacity>
              </View>

              {/* Card Section 4: Amount Summary */}
              {showFinancials && (
                <View style={{ backgroundColor: colors.bg.secondary, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={[styles.inputLabel, { color: colors.primary, fontSize: 13, marginBottom: 10 }]}>💰 Amount Bifurcation</Text>
                  
                  <View style={{ gap: 6 }}>
                    {totalMrpValue > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, color: colors.text.muted }}>Total Item MRP</Text>
                        <Text style={{ fontSize: 12, color: colors.text.secondary, fontWeight: '600' }}>₹{totalMrpValue.toFixed(2)}</Text>
                      </View>
                    )}

                    {totalDiscountSaved > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: colors.success, fontWeight: '600' }}>Total Discount Saved</Text>
                        <View style={{ backgroundColor: colors.success + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm }}>
                          <Text style={{ fontSize: 12, color: colors.success, fontWeight: '700' }}>- ₹{totalDiscountSaved.toFixed(2)}</Text>
                        </View>
                      </View>
                    )}

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 12, color: colors.text.secondary }}>Taxable Value (Base Amount)</Text>
                      <Text style={{ fontSize: 12, color: colors.text.primary, fontWeight: '600' }}>₹{totalBase.toFixed(2)}</Text>
                    </View>
                    
                    {cgst > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, color: colors.text.secondary }}>CGST</Text>
                        <Text style={{ fontSize: 12, color: colors.text.primary, fontWeight: '600' }}>₹{cgst.toFixed(2)}</Text>
                      </View>
                    )}
                    
                    {sgst > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, color: colors.text.secondary }}>SGST</Text>
                        <Text style={{ fontSize: 12, color: colors.text.primary, fontWeight: '600' }}>₹{sgst.toFixed(2)}</Text>
                      </View>
                    )}
                    
                    {igst > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, color: colors.text.secondary }}>IGST</Text>
                        <Text style={{ fontSize: 12, color: colors.text.primary, fontWeight: '600' }}>₹{igst.toFixed(2)}</Text>
                      </View>
                    )}
                    
                    {roundOff !== 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, color: colors.text.secondary }}>Round Off</Text>
                        <Text style={{ fontSize: 12, color: colors.text.primary, fontWeight: '600' }}>{roundOff > 0 ? '+' : ''}₹{roundOff.toFixed(2)}</Text>
                      </View>
                    )}
                    
                    <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>Grand Total</Text>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.primary }}>₹{nettTotal.toLocaleString()}</Text>
                    </View>
                  </View>
                </View>
              )}
              </Pressable>
    </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Inline Detail View ────────────────────────────────────────────────────────
  if (showDetail && detailMovement) {
    return (
      <View style={styles.screen}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setShowDetail(false)}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{detailMovement.docNo.split('/').pop()}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => handleUploadChallanDoc(detailMovement._id)} style={{ padding: 4 }}>
              <Ionicons name="cloud-upload" size={22} color={colors.success} />
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView style={styles.modalForm} contentContainerStyle={{ padding: 16 }}>
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <View style={[styles.badge, { backgroundColor: STATUS_COLORS[detailMovement.status] + '20', borderColor: STATUS_COLORS[detailMovement.status] }]}>
                      <Text style={[styles.badgeText, { color: STATUS_COLORS[detailMovement.status] }]}>{detailMovement.status.toUpperCase()}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: (TYPE_CONFIG[detailMovement.type]?.color || colors.primary) + '15', borderColor: TYPE_CONFIG[detailMovement.type]?.color || colors.primary }]}>
                      <Text style={[styles.badgeText, { color: TYPE_CONFIG[detailMovement.type]?.color || colors.primary }]}>{TYPE_CONFIG[detailMovement.type]?.label || detailMovement.type}</Text>
                    </View>
                    {detailMovement.type === 'sale' && (
                      <View style={[styles.badge, { backgroundColor: (detailMovement as any).billingMode === 'cash' ? '#fef3c7' : '#eff6ff', borderColor: (detailMovement as any).billingMode === 'cash' ? '#f59e0b' : '#3b82f6' }]}>
                        <Text style={[styles.badgeText, { color: (detailMovement as any).billingMode === 'cash' ? '#f59e0b' : '#3b82f6' }]}>{((detailMovement as any).billingMode || 'regular').toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.detailLabel}>Date</Text>
                  <Text style={styles.detailValue}>{new Date(detailMovement.date).toLocaleDateString('en-IN')}</Text>
                  <Text style={styles.detailLabel}>Party</Text>
                  <Text style={styles.detailValue}>{detailMovement.partyName}{detailMovement.partyGstin ? ` (${detailMovement.partyGstin})` : ''}</Text>
                  {detailMovement.partyAddress ? <><Text style={styles.detailLabel}>Address</Text><Text style={styles.detailValue}>{detailMovement.partyAddress}</Text></> : null}
                  <Text style={styles.detailLabel}>Warehouse</Text>
                  <Text style={styles.detailValue}>{detailMovement.warehouseName}</Text>
                  {(detailMovement as any).medicalRepName ? <><Text style={styles.detailLabel}>MR Name</Text><Text style={styles.detailValue}>{(detailMovement as any).medicalRepName}</Text></> : null}
                  {(detailMovement as any).doctorName ? <><Text style={styles.detailLabel}>Doctor Name</Text><Text style={styles.detailValue}>{(detailMovement as any).doctorName}</Text></> : null}
                  {(detailMovement as any).damageReason ? <><Text style={styles.detailLabel}>Damage Reason</Text><Text style={[styles.detailValue, { color: '#ef4444' }]}>{(detailMovement as any).damageReason}</Text></> : null}
                  {detailMovement.convertedToInvoice && <Text style={[styles.detailValue, { color: colors.success }]}>✓ Invoiced: {detailMovement.invoiceNo}</Text>}
                  {detailMovement.notes ? <><Text style={styles.detailLabel}>Notes</Text><Text style={styles.detailValue}>{detailMovement.notes}</Text></> : null}

                  {(detailMovement.transporter || detailMovement.courierName || detailMovement.lrNo || detailMovement.vehicleNo || detailMovement.trackingId) ? (
                    <View style={{ backgroundColor: colors.bg.secondary, borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: colors.border }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, marginBottom: 4 }}>🚚 LOGISTICS &amp; TRANSPORT DETAILS</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                        {detailMovement.transporter ? <Text style={{ fontSize: 12, color: colors.text.secondary }}>Transporter: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{detailMovement.transporter}</Text></Text> : null}
                        {detailMovement.lrNo ? <Text style={{ fontSize: 12, color: colors.text.secondary }}>LR/GR No: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{detailMovement.lrNo}</Text></Text> : null}
                        {detailMovement.vehicleNo ? <Text style={{ fontSize: 12, color: colors.text.secondary }}>Vehicle: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{detailMovement.vehicleNo}</Text></Text> : null}
                        {detailMovement.courierName ? <Text style={{ fontSize: 12, color: colors.text.secondary }}>Courier: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{detailMovement.courierName}</Text></Text> : null}
                        {detailMovement.trackingId ? <Text style={{ fontSize: 12, color: colors.text.secondary }}>Tracking ID: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{detailMovement.trackingId}</Text></Text> : null}
                        {detailMovement.totalBoxes ? <Text style={{ fontSize: 12, color: colors.text.secondary }}>Boxes: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{detailMovement.totalBoxes}</Text></Text> : null}
                      </View>
                    </View>
                  ) : null}
                </View>

                <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Items</Text>
                {detailMovement.items.map((it, i) => {
                  const mrpVal = it.mrp || 0;
                  const discPct = it.discountPercent || (mrpVal > 0 && it.rate ? parseFloat((((mrpVal - it.rate) / mrpVal) * 100).toFixed(1)) : 0);
                  return (
                    <View key={i} style={{ paddingVertical: 6, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 2 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary }}>{it.productName}</Text>
                          <Text style={{ fontSize: 11, color: colors.text.muted }}>
                            {it.batchNo ? `Batch: ${it.batchNo} | ` : ''}
                            {mrpVal > 0 ? `MRP: ₹${mrpVal}` : ''}
                            {discPct > 0 ? ` (${discPct}% off)` : ''}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 12, color: colors.text.secondary, flex: 1, textAlign: 'center' }}>Qty: {(it.qty || 0) * (it.packing || 1)} pcs</Text>
                        <Text style={{ fontSize: 12, color: colors.success, fontWeight: '700', flex: 1, textAlign: 'right' }}>
                          {(it.rate || 0) > 0 ? `₹${((it.qty || 0) * (it.rate || 0) * (it.packing || 1)).toLocaleString('en-IN')}` : 'Free'}
                        </Text>
                      </View>
                    </View>
                  );
                })}

                {(detailMovement.totalAmount || 0) > 0 && (
                  <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8, paddingTop: 8, gap: 4 }}>
                    {(detailMovement as any).totalMrp > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, color: colors.text.muted }}>Total Item MRP</Text>
                        <Text style={{ fontSize: 12, color: colors.text.muted }}>₹{(detailMovement as any).totalMrp.toLocaleString('en-IN')}</Text>
                      </View>
                    )}
                    {(detailMovement as any).totalDiscount > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.success }}>Total Discount Saved</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.success }}>- ₹{(detailMovement as any).totalDiscount.toLocaleString('en-IN')}</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <Text style={{ fontWeight: '700', color: colors.text.primary }}>Grand Total</Text>
                      <Text style={{ fontWeight: '800', fontSize: 15, color: colors.primary }}>₹{detailMovement.totalAmount.toLocaleString('en-IN')}</Text>
                    </View>
                  </View>
                )}

                {/* Supporting Documents Vault */}
                <View style={{ gap: 6, marginVertical: 14, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>📎 Supporting Documents & Delivery Proof (POD):</Text>
                  
                  {(detailMovement as any).supportingDocuments && (detailMovement as any).supportingDocuments.length > 0 ? (
                    <View style={{ gap: 6, marginTop: 4 }}>
                      {(detailMovement as any).supportingDocuments.map((doc: any, docIdx: number) => (
                        <View key={docIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg.secondary, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
                          <TouchableOpacity onPress={() => Platform.OS === 'web' ? window.open(doc.url, '_blank') : Alert.alert('View Document', doc.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                            <Ionicons name="document-attach" size={15} color={colors.primary} />
                            <Text style={{ fontSize: 12, color: colors.text.primary, fontWeight: '600' }} numberOfLines={1}>{doc.name}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteChallanDoc(detailMovement._id, doc.url)} style={{ padding: 4 }}>
                            <Ionicons name="trash-outline" size={14} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 11, color: colors.text.muted, fontStyle: 'italic', marginTop: 2 }}>No supporting documents uploaded.</Text>
                  )}
                </View>

                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 20 }}>
                  {/* Finalize */}
                  {detailMovement.status === 'draft' && (
                    <TouchableOpacity style={[styles.detailActionBtn, { backgroundColor: colors.success }]} onPress={() => { setShowDetail(false); handleFinalize(detailMovement); }}>
                      <Ionicons name="checkmark-done-outline" size={16} color="#fff" />
                      <Text style={styles.detailActionBtnText}>Finalize</Text>
                    </TouchableOpacity>
                  )}

                  {/* Edit */}
                  {detailMovement.status === 'draft' && (
                    <TouchableOpacity style={[styles.detailActionBtn, { backgroundColor: colors.info }]} onPress={() => {
                      setShowDetail(false);
                      setEditId(detailMovement._id);
                      const foundCust = customers.find(c => c.company === detailMovement.partyName || c.name === detailMovement.partyName);
                      setForm({ ...DEFAULT_FORM, ...(detailMovement as any), partyId: detailMovement.partyId || foundCust?._id || '' });
                      setItems((detailMovement.items || []).map((it: any) => {
                        const mrpVal = it.mrp || it.rate || 0;
                        const netRate = it.rate || 0;
                        let discPct = it.discountPercent || 0;
                        if (!discPct && mrpVal > 0 && mrpVal > netRate) {
                          discPct = parseFloat((((mrpVal - netRate) / mrpVal) * 100).toFixed(1));
                        }
                        return {
                          ...it,
                          mrp: mrpVal,
                          discountPercent: discPct,
                          rate: netRate
                        };
                      }));
                      setCustomerSearch(detailMovement.partyName || '');
                      setShowModal(true);
                    }}>
                      <Ionicons name="create-outline" size={16} color="#fff" />
                      <Text style={styles.detailActionBtnText}>Edit</Text>
                    </TouchableOpacity>
                  )}

                  {/* Delete */}
                  {detailMovement.status !== 'dispatched' && detailMovement.status !== 'received' && (
                    <TouchableOpacity style={[styles.detailActionBtn, { backgroundColor: colors.danger }]} onPress={() => { setShowDetail(false); handleDelete(detailMovement._id); }}>
                      <Ionicons name="trash-outline" size={16} color="#fff" />
                      <Text style={styles.detailActionBtnText}>Delete</Text>
                    </TouchableOpacity>
                  )}

                  {/* Convert to Invoice */}
                  {detailMovement.type === 'sale' && (detailMovement as any).billingMode !== 'cash' && detailMovement.direction === 'out' && detailMovement.partyGstin && !detailMovement.convertedToInvoice && detailMovement.status === 'dispatched' && (
                    <TouchableOpacity style={[styles.detailActionBtn, { backgroundColor: colors.success }]} onPress={() => { setShowDetail(false); handleConvertToInvoice(detailMovement._id); }}>
                      <Ionicons name="document-text-outline" size={18} color="#fff" />
                      <Text style={styles.detailActionBtnText}>Convert to GST Tax Invoice</Text>
                    </TouchableOpacity>
                  )}

                  {/* Cancel */}
                  {(detailMovement.status === 'dispatched' || detailMovement.status === 'received') && !detailMovement.convertedToInvoice && (
                    <TouchableOpacity style={[styles.detailActionBtn, { backgroundColor: colors.warning }]} onPress={() => { setShowDetail(false); handleCancel(detailMovement._id); }}>
                      <Ionicons name="close-circle-outline" size={18} color="#fff" />
                      <Text style={styles.detailActionBtnText}>Cancel Challan</Text>
                    </TouchableOpacity>
                  )}

                  {/* Print */}
                  <TouchableOpacity style={[styles.detailActionBtn, { backgroundColor: colors.primary }]} onPress={() => printDeliveryChallan(detailMovement)}>
                    <Ionicons name="print-outline" size={16} color="#fff" />
                    <Text style={styles.detailActionBtnText}>Print</Text>
                  </TouchableOpacity>
                </View>
        </ScrollView>
      </View>
    );
  }

  // ── Main List View ────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      {/* Sub-tab pills */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, padding: 4, marginHorizontal: Spacing.lg, marginTop: Spacing.md }}>
        <TouchableOpacity
          style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: Radius.sm }, topTab === 'challans' && { backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border }]}
          onPress={() => setTopTab('challans')}
        >
          <Ionicons name="bus-outline" size={16} color={topTab === 'challans' ? colors.primary : colors.text.secondary} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: topTab === 'challans' ? colors.primary : colors.text.secondary }}>
            Delivery Challans
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: Radius.sm }, topTab === 'dispatches' && { backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border }]}
          onPress={() => setTopTab('dispatches')}
        >
          <Ionicons name="navigate-outline" size={16} color={topTab === 'dispatches' ? colors.primary : colors.text.secondary} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: topTab === 'dispatches' ? colors.primary : colors.text.secondary }}>
            Courier &amp; Dispatch Tracking
          </Text>
        </TouchableOpacity>
      </View>

      {topTab === 'dispatches' ? (
        <InventoryDispatchScreen />
      ) : (
        <>
          {/* Search Bar Container with Type/Status Dropdowns and New Challan Button Inside */}
          <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.sm, marginBottom: Spacing.xs }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.bg.card,
          paddingHorizontal: 12,
          paddingRight: 8,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 10,
          minHeight: 46
        }}>
          <Ionicons name="search" size={18} color={colors.text.muted} />
          <TextInput
            style={{ flex: 1, height: 42, color: colors.text.primary, fontSize: 13, minWidth: 100 }}
            value={search}
            onChangeText={setSearch}
            placeholder="Search doc no or party..."
            placeholderTextColor={colors.text.muted}
          />

          {/* Type & Status Dropdowns inside search bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {Platform.OS === 'web' ? (
              <>
                <select
                  value={filterType}
                  onChange={(e: any) => setFilterType(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${colors.border}`,
                    backgroundColor: colors.bg.secondary,
                    color: colors.text.primary,
                    fontSize: 12,
                    outline: 'none',
                    height: 32,
                    cursor: 'pointer'
                  }}
                >
                  <option value="">All Types</option>
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>

                <select
                  value={filterStatus}
                  onChange={(e: any) => setFilterStatus(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${colors.border}`,
                    backgroundColor: colors.bg.secondary,
                    color: colors.text.primary,
                    fontSize: 12,
                    outline: 'none',
                    height: 32,
                    cursor: 'pointer'
                  }}
                >
                  <option value="">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="dispatched">Dispatched</option>
                  <option value="received">Received</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.mobileSelectBtn} onPress={() => { const validTypes = Object.entries(TYPE_CONFIG); Alert.alert('Select Type', '', ['All Types', ...validTypes.map(([,v]) => v.label)].map((o, idx) => ({ text: o, onPress: () => { if (idx === 0) setFilterType(''); else setFilterType(validTypes[idx-1][0]); } }))); }}>
                  <Text style={styles.mobileSelectText} numberOfLines={1}>{filterType ? (TYPE_CONFIG[filterType]?.label || filterType) : 'Type'}</Text>
                  <Ionicons name="chevron-down" size={10} color={colors.text.muted} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.mobileSelectBtn} onPress={() => { const opts = ['All Statuses','Draft','Dispatched','Received','Cancelled']; Alert.alert('Select Status', '', opts.map((o, idx) => ({ text: o, onPress: () => setFilterStatus(['','draft','dispatched','received','cancelled'][idx]) }))); }}>
                  <Text style={styles.mobileSelectText}>{filterStatus ? filterStatus.toUpperCase() : 'Status'}</Text>
                  <Ionicons name="chevron-down" size={10} color={colors.text.muted} />
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* New Challan Button (+) inside search bar */}
          <TouchableOpacity
            style={[styles.addBtn, { height: 34, paddingHorizontal: 12, borderRadius: Radius.sm }]}
            onPress={() => { setEditId(null); resetForm(); setShowModal(true); }}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>New Challan</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

        {movements.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={40} color={colors.text.secondary} />
            <Text style={styles.emptyText}>No delivery challans found.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ flexGrow: 1, width: '100%' }}>
            <View style={styles.table}>
              {/* Table Header */}
              <View style={styles.tableHeaderRow}>
                <View style={[styles.tableHeaderCellContainer, { width: 120 }]}><Text style={styles.tableHeaderCell}>Doc No</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 90 }]}><Text style={styles.tableHeaderCell}>Date</Text></View>
                <View style={[styles.tableHeaderCellContainer, { flex: 1, minWidth: 220 }]}><Text style={styles.tableHeaderCell}>Party</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 130 }]}><Text style={styles.tableHeaderCell}>Warehouse</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 100 }]}><Text style={styles.tableHeaderCell}>Type</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 100 }]}><Text style={styles.tableHeaderCell}>Status</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 100 }]}><Text style={[styles.tableHeaderCell, { textAlign: 'right' }]}>Amount</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 160, borderRightWidth: 0 }]}><Text style={[styles.tableHeaderCell, { textAlign: 'center' }]}>Actions</Text></View>
              </View>

              {movements.map(m => {
                const tc = TYPE_CONFIG[m.type] || { label: m.type, color: '#999' };
                return (
                  <Pressable key={m._id} style={styles.tableBodyRow} onPress={() => { setDetailMovement(m); setShowDetail(true); }}>
                    {/* Doc No */}
                    <View style={[styles.tableCellContainer, { width: 120 }]}>
                      <Text style={[styles.primaryText, { color: colors.primary }]} numberOfLines={1}>{m.docNo.split('/').pop()}</Text>
                      {m.billingMode === 'cash' && <Text style={{ fontSize: 9, color: '#f59e0b', fontWeight: '700' }}>CASH</Text>}
                    </View>

                    {/* Date */}
                    <View style={[styles.tableCellContainer, { width: 90 }]}>
                      <Text style={styles.tableCell}>{new Date(m.date).toLocaleDateString('en-IN')}</Text>
                    </View>

                    {/* Party */}
                    <View style={[styles.tableCellContainer, { flex: 1, minWidth: 220, gap: 2 }]}>
                      <Text style={[styles.primaryText, { fontSize: 13 }]} numberOfLines={1}>{m.partyName || '—'}</Text>
                      {m.type === 'sample' && ((m as any).medicalRepName || (m as any).doctorName) && (
                        <Text style={{ fontSize: 10, color: '#8b5cf6', fontWeight: '600' }} numberOfLines={1}>MR: {(m as any).medicalRepName || '—'} · Dr: {(m as any).doctorName || '—'}</Text>
                      )}
                      {m.type === 'damage' && (m as any).damageReason && (
                        <Text style={{ fontSize: 10, color: '#ef4444', fontWeight: '600' }} numberOfLines={1}>{(m as any).damageReason}</Text>
                      )}
                    </View>

                    {/* Warehouse */}
                    <View style={[styles.tableCellContainer, { width: 130 }]}>
                      <Text style={styles.tableCell} numberOfLines={1}>{m.warehouseName || '—'}</Text>
                    </View>

                    {/* Movement Type */}
                    <View style={[styles.tableCellContainer, { width: 100 }]}>
                      <View style={[styles.badge, { backgroundColor: tc.color + '15', borderColor: tc.color, paddingHorizontal: 8, paddingVertical: 3 }]}>
                        <Text style={[styles.badgeText, { color: tc.color, fontSize: 9 }]}>{tc.label}</Text>
                      </View>
                      {m.convertedToInvoice && <Text style={{ fontSize: 10, color: colors.success, fontWeight: '600', marginTop: 4 }}>Inv: {m.invoiceNo}</Text>}
                    </View>

                    {/* Status */}
                    <View style={[styles.tableCellContainer, { width: 100 }]}>
                      <View style={[styles.badge, { backgroundColor: STATUS_COLORS[m.status] + '20', borderColor: STATUS_COLORS[m.status] }]}>
                        <Text style={[styles.badgeText, { color: STATUS_COLORS[m.status], fontSize: 9 }]}>{m.status.toUpperCase()}</Text>
                      </View>
                    </View>

                    {/* Total Amount */}
                    <View style={[styles.tableCellContainer, { width: 100 }]}>
                      <Text style={[styles.tableCell, { fontWeight: '700', color: colors.text.primary, textAlign: 'right' }]}>
                        ₹{(m.totalAmount || 0).toLocaleString('en-IN')}
                      </Text>
                    </View>

                    {/* Actions */}
                    <View style={[styles.tableCellContainer, { width: 160, borderRightWidth: 0, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }]}>
                      {/* Print DC */}
                      <TouchableOpacity style={styles.actionPillBtn} onPress={(e) => { e.stopPropagation?.(); printDeliveryChallan(m); }}>
                        <Ionicons name="print-outline" size={12} color={colors.primary} />
                        <Text style={[styles.actionPillText, { color: colors.primary }]}>Print</Text>
                      </TouchableOpacity>
                      {/* WhatsApp Share */}
                      <TouchableOpacity
                        style={[styles.actionPillBtn, { backgroundColor: '#25D366' + '15', borderColor: '#25D366' + '40' }]}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          const itemLines = (m.items || [])
                            .map((it, i) => `  ${i + 1}. ${it.productName} — ${(it.qty || 0) * (it.packing || 1)} pcs`)
                            .join('\n');
                          const total = m.totalAmount
                            ? `₹${m.totalAmount.toLocaleString('en-IN')}`
                            : 'Free / Sample';
                          const dateStr = new Date(m.date).toLocaleDateString('en-IN');
                          const msg = `*Delivery Challan: ${m.docNo}*\nDate: ${dateStr}\nParty: ${m.partyName || '—'}\nWarehouse: ${m.warehouseName || '—'}\n\n*Items:*\n${itemLines}\n\n*Total: ${total}*`;
                          const encoded = encodeURIComponent(msg);
                          if (Platform.OS === 'web') {
                            (window as any).open(`https://wa.me/?text=${encoded}`, '_blank');
                          } else {
                            const { Linking } = require('react-native');
                            Linking.openURL(`whatsapp://send?text=${encoded}`);
                          }
                        }}
                      >
                        <Ionicons name="logo-whatsapp" size={12} color="#25D366" />
                        <Text style={[styles.actionPillText, { color: '#25D366' }]}>Share</Text>
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}
      </ScrollView>
        </>
      )}
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  pageHeader: { paddingHorizontal: Spacing.lg, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageTitle: { fontSize: 24, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 11, color: colors.text.muted, marginTop: 3 },
  filterBar: { paddingHorizontal: Spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  searchInputContainer: { flex: 2, minWidth: 180, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, height: 36, backgroundColor: colors.bg.primary, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1 },
  searchInputField: { flex: 1, fontSize: 13, color: colors.text.primary, height: '100%', paddingLeft: 6 },
  dropdownsContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  mobileSelectBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, height: 36, gap: 6 },
  mobileSelectText: { fontSize: 12, color: colors.text.primary, fontWeight: '600' },
  content: { padding: Spacing.lg, gap: 12, paddingBottom: 40 },
  statsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 6 },
  statCard: { flex: 1, minWidth: 80, backgroundColor: colors.bg.secondary, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2, borderWidth: 1, borderColor: colors.border },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, color: colors.text.secondary, marginTop: 4, textAlign: 'center', fontWeight: '600' },
  card: { backgroundColor: colors.bg.secondary, borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.2 },
  cardSubTitle: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  metaText: { fontSize: 11, color: colors.text.muted, marginTop: 2 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 0 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, shadowColor: colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  iconBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  actionPillBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' },
  actionPillText: { fontSize: 11, fontWeight: '700' },
  emptyBox: { alignItems: 'center', padding: 40, gap: 8 },
  emptyText: { color: colors.text.secondary, fontSize: 13 },
  table: { flex: 1, width: '100%', minWidth: 900, backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, marginVertical: Spacing.md, overflow: 'hidden' },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  tableHeaderCell: { fontSize: 11, fontWeight: '800', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableHeaderCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  tableBodyRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  tableCell: { fontSize: 13, color: colors.text.primary },
  tableCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  primaryText: { fontSize: 13, fontWeight: '800', color: colors.text.primary },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContainer: { flex: 1, backgroundColor: colors.bg.primary },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text.primary },
  modalError: { backgroundColor: colors.danger + '15', color: colors.danger, padding: 10, margin: 12, borderRadius: 6, fontSize: 12 },
  modalForm: { flex: 1 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: colors.text.secondary, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: colors.text.primary, backgroundColor: colors.bg.secondary, marginBottom: 12 },
  smallInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, fontSize: 12, color: colors.text.primary, backgroundColor: colors.bg.secondary, marginBottom: 4 },
  fieldLabel: { fontSize: 10, color: colors.text.muted, marginBottom: 2 },
  toggleChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.primary },
  toggleChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleChipText: { fontSize: 12, color: colors.text.secondary },
  toggleChipTextActive: { color: '#fff' },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border },
  cancelBtnText: { fontSize: 13, color: colors.text.secondary, fontWeight: '600' },
  submitBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.md, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { fontSize: 13, color: '#fff', fontWeight: '700' },
  detailActionBtn: { flex: 1, minWidth: 140, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 },
  detailActionBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  detailLabel: { fontSize: 11, color: colors.text.muted, marginTop: 6, marginBottom: 1 },
  detailValue: { fontSize: 13, color: colors.text.primary },
  info: { color: (LightColors as any).info },
  warning: { color: (LightColors as any).warning },
  danger: { color: (LightColors as any).danger },
  customSearchSelectContainer: { position: 'relative', width: '100%' },
  customSelectPanel: { position: 'absolute', top: 50, left: 0, right: 0, backgroundColor: colors.bg.primary, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, zIndex: 2000, elevation: 4 },
  customSelectItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  customSelectItemText: { fontSize: 13, fontWeight: '700', color: colors.text.primary },
  customSelectItemSubtext: { fontSize: 10, color: colors.text.muted, marginTop: 2 },
});
