import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, RefreshControl, Modal, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors } from '../../constants/theme';
import { api, Invoice, Product, Vendor, Warehouse } from '../../utils/api';
import { useAuth } from '../../utils/auth';
import { useTheme, useStyles } from '../../utils/themeContext';

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
  } else if (w.endsWith('gm')) {
    w = w.slice(0, -2) + 'g';
  } else if (!w.endsWith('g')) {
    if (/^\d+(\.\d+)?$/.test(w)) {
      w += 'g';
    }
  }
  return w;
};

const getProductSelectorDisplayName = (item: { size?: string; shape?: string; colour?: string; weight?: string; name?: string }) => {
  const parts = [
    formatSize(item.size),
    toTitleCase(item.shape),
    toTitleCase(item.colour),
    formatWeight(item.weight)
  ];
  const combined = parts.filter(Boolean).join(' ');
  return combined || item.name || 'Unnamed Product';
};

function InvoiceDetailModal({ invoice, visible, onClose, onDeleted, onEdit }: { invoice: Invoice | null; visible: boolean; onClose: () => void; onDeleted: () => void; onEdit: (invoice: Invoice) => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuth();

  if (!invoice) return null;

  const handleDelete = async () => {
    try {
      const success = await api.deletePurchaseInvoice(invoice._id);
      if (success) {
        onDeleted();
        onClose();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete invoice');
    }
  };

  const isPending = invoice.status === 'pending';

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Purchase Invoice</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          <View style={styles.profileHeader}>
            <View style={styles.profileAvatar}>
              <Ionicons name="receipt" size={36} color={colors.purple} />
            </View>
            <Text style={styles.profileName}>{invoice.invoiceNo}</Text>
            <Text style={styles.profileSupplier}>{invoice.supplierName}</Text>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.successLight }]}>
                <Ionicons name="pricetag" size={16} color={colors.success} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Billing Mode</Text>
                <Text style={[styles.infoValue, { color: colors.success }]}>
                  INVOICE
                </Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.warningLight }]}>
                <Ionicons name="cash" size={16} color={colors.warning} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Outstanding Balance</Text>
                <Text style={styles.infoValue}>₹{invoice.amount.toLocaleString()}</Text>
              </View>
            </View>

            {((invoice.gstRate || 0) > 0 || invoice.mode === 'pakka') && (
              <>
                <View style={styles.infoItem}>
                  <View style={[styles.infoIcon, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="calculator-outline" size={16} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>GST Breakdown</Text>
                    <Text style={styles.infoValue}>
                      Base: ₹{invoice.baseAmount?.toLocaleString() || '0'} | Rate: {invoice.gstRate || 0}%
                    </Text>
                    {invoice.igst && invoice.igst > 0 ? (
                      <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                        IGST: ₹{invoice.igst.toLocaleString()} (Inter-state)
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                        CGST: ₹{(invoice.cgst || 0).toLocaleString()} | SGST: ₹{(invoice.sgst || 0).toLocaleString()} (Intra-state)
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.infoItem}>
                  <View style={[styles.infoIcon, { backgroundColor: colors.infoLight }]}>
                    <Ionicons name="map-outline" size={16} color={colors.info} />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>State of Supply & Party GSTIN</Text>
                    <Text style={styles.infoValue}>
                      State: {invoice.stateOfSupply || 'Uttar Pradesh'} | GSTIN: {invoice.gstin || 'None'}
                    </Text>
                  </View>
                </View>
                {invoice.warehouseName ? (
                  <View style={styles.infoItem}>
                    <View style={[styles.infoIcon, { backgroundColor: colors.infoLight }]}>
                      <Ionicons name="business" size={16} color={colors.info} />
                    </View>
                    <View>
                      <Text style={styles.infoLabel}>Destination Warehouse</Text>
                      <Text style={styles.infoValue}>{invoice.warehouseName}</Text>
                    </View>
                  </View>
                ) : null}
              </>
            )}

            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="calendar" size={16} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Invoice Date</Text>
                <Text style={styles.infoValue}>{new Date(invoice.date).toLocaleDateString()} {new Date(invoice.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: isPending ? colors.warningLight : colors.successLight }]}>
                <Ionicons name="shield-checkmark" size={16} color={isPending ? colors.warning : colors.success} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Payment Status</Text>
                <Text style={[styles.infoValue, { color: isPending ? colors.warning : colors.success }]}>
                  {invoice.status.toUpperCase()}
                </Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: invoice.isFinalized ? colors.successLight : colors.warningLight }]}>
                <Ionicons name={invoice.isFinalized ? "lock-closed" : "document-text"} size={16} color={invoice.isFinalized ? colors.success : colors.warning} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Document Status</Text>
                <Text style={[styles.infoValue, { color: invoice.isFinalized ? colors.success : colors.warning }]}>
                  {invoice.isFinalized ? 'FINALIZED' : 'DRAFT'}
                </Text>
              </View>
            </View>
          </View>

          {invoice.items && invoice.items.length > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text style={[styles.formLabel, { marginBottom: 8, fontSize: 14, color: colors.text.primary }]}>Invoice Items</Text>
              <View style={styles.detailTable}>
                {/* Table Header */}
                <View style={styles.detailTableHeader}>
                  <Text style={[styles.detailTableHeaderCell, { flex: 1.8 }]}>Product</Text>
                  <Text style={[styles.detailTableHeaderCell, { flex: 0.8, textAlign: 'center' }]}>Boxes</Text>
                  <Text style={[styles.detailTableHeaderCell, { flex: 0.8, textAlign: 'center' }]}>Packing</Text>
                  <Text style={[styles.detailTableHeaderCell, { flex: 1.0, textAlign: 'right' }]}>Rate (₹)</Text>
                  <Text style={[styles.detailTableHeaderCell, { flex: 0.9, textAlign: 'center' }]}>GST</Text>
                  <Text style={[styles.detailTableHeaderCell, { flex: 1.0, textAlign: 'right' }]}>Subtotal</Text>
                </View>

                {/* Table Body */}
                {invoice.items.map((item, idx) => {
                  const boxes = item.boxes !== undefined ? item.boxes : (item.qty || 0);
                  const packing = item.packing !== undefined ? item.packing : 1;
                  const rate = item.rate || 0;
                  const itemSubtotal = boxes * packing * rate;
                  const gstVal = (itemSubtotal * (item.gstRate || 0)) / 100;
                  const itemTotal = itemSubtotal + gstVal;
                  return (
                    <View key={idx} style={styles.detailTableRow}>
                      <Text style={[styles.detailTableCell, { flex: 1.8, fontWeight: '600' }]} numberOfLines={2}>{item.name}</Text>
                      <Text style={[styles.detailTableCell, { flex: 0.8, textAlign: 'center' }]}>{boxes}</Text>
                      <Text style={[styles.detailTableCell, { flex: 0.8, textAlign: 'center' }]}>{packing}/box</Text>
                      <Text style={[styles.detailTableCell, { flex: 1.0, textAlign: 'right' }]}>₹{rate.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                      <Text style={[styles.detailTableCell, { flex: 0.9, textAlign: 'center' }]}>{item.gstRate || 0}%</Text>
                      <Text style={[styles.detailTableCell, { flex: 1.0, textAlign: 'right', fontWeight: '700' }]}>₹{itemTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Finalize Button */}
          {!invoice.isFinalized && (
            <TouchableOpacity
              style={[styles.printBtn, { marginTop: 24, backgroundColor: colors.success }]}
              onPress={async () => {
                try {
                  await api.finalizePurchaseInvoice(invoice._id);
                  onDeleted(); // Reload parent
                  onClose();
                } catch (err: any) {
                  alert(err.message || 'Failed to finalize invoice');
                }
              }}
            >
              <Ionicons name="checkmark-done-circle" size={18} color="#fff" />
              <Text style={styles.printBtnText}>Finalize Invoice</Text>
            </TouchableOpacity>
          )}

          {/* Edit Button */}
          {!invoice.isFinalized && (
            <TouchableOpacity
              style={[styles.printBtn, { marginTop: 10, backgroundColor: colors.info }]}
              onPress={() => {
                onClose();
                onEdit(invoice);
              }}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={styles.printBtnText}>Edit Draft Details</Text>
            </TouchableOpacity>
          )}

          {/* Toggle Payment Status */}
          {invoice.isFinalized && invoice.status?.toLowerCase() !== 'paid' && (
            <TouchableOpacity
              style={[styles.printBtn, { marginTop: 10, backgroundColor: colors.success }]}
              onPress={async () => {
                try {
                  await api.updatePurchaseInvoice(invoice._id, { status: 'paid' });
                  onDeleted(); // Reload parent
                  onClose();
                } catch (err: any) {
                  alert(err.message || 'Failed to update payment status');
                }
              }}
            >
              <Ionicons name="cash-outline" size={18} color="#fff" />
              <Text style={styles.printBtnText}>Mark as Paid</Text>
            </TouchableOpacity>
          )}

          {invoice.isFinalized && invoice.status?.toLowerCase() === 'paid' && (
            <TouchableOpacity
              style={[styles.printBtn, { marginTop: 10, backgroundColor: colors.warning }]}
              onPress={async () => {
                try {
                  await api.updatePurchaseInvoice(invoice._id, { status: 'pending' });
                  onDeleted(); // Reload parent
                  onClose();
                } catch (err: any) {
                  alert(err.message || 'Failed to update payment status');
                }
              }}
            >
              <Ionicons name="alert-circle-outline" size={18} color="#fff" />
              <Text style={styles.printBtnText}>Mark as Unpaid (Pending)</Text>
            </TouchableOpacity>
          )}

          {user?.role === 'admin' && invoice.status !== 'Cancelled' && (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.deleteBtnText}>Delete Invoice</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function AddInvoiceModal({ visible, onClose, onSaved, invoiceToEdit }: { visible: boolean; onClose: () => void; onSaved: () => void; invoiceToEdit?: Invoice | null }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useStyles(createStyles);
  const canAccessCash = user?.canAccessCash ?? false;

  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [stateOfSupply, setStateOfSupply] = useState('Uttar Pradesh');
  const [status, setStatus] = useState('pending');
  const mode = 'pakka';
  const [freightAmount, setFreightAmount] = useState('');
  const [cartageAmount, setCartageAmount] = useState('');
  const [transport, setTransport] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [ewayBillNo, setEwayBillNo] = useState('');
  const [internalFreightExpense, setInternalFreightExpense] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState('');
  const [showTermsDropdown, setShowTermsDropdown] = useState(false);
  const [overridePaymentTerms, setOverridePaymentTerms] = useState(false);

  // Search list states
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [showWarehouseDropdown, setShowWarehouseDropdown] = useState(false);

  // Tabular items state
  const [rows, setRows] = useState<Array<{
    id: string;
    productSearch: string;
    showProductDropdown: boolean;
    showGstDropdown: boolean;
    selectedProduct: Product | null;
    boxes: string;
    packing: string;
    rate: string;
    gstRate: number;
  }>>([]);

  useEffect(() => {
    if (visible) {
      if (invoiceToEdit) {
        setDate(invoiceToEdit.date ? new Date(invoiceToEdit.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
        setDueDate(invoiceToEdit.dueDate ? new Date(invoiceToEdit.dueDate).toISOString().split('T')[0] : '');
        setInvoiceNo(invoiceToEdit.invoiceNo || '');
        setSupplierName(invoiceToEdit.supplierName || '');
        setStateOfSupply(invoiceToEdit.stateOfSupply || 'Uttar Pradesh');
        setStatus(invoiceToEdit.status || 'pending');

        setFreightAmount(invoiceToEdit.freightAmount ? invoiceToEdit.freightAmount.toString() : '');
        setCartageAmount(invoiceToEdit.cartageAmount ? invoiceToEdit.cartageAmount.toString() : '');
        setTransport(invoiceToEdit.transport || '');
        setVehicleNo(invoiceToEdit.vehicleNo || '');
        setEwayBillNo(invoiceToEdit.ewayBillNo || '');
        setInternalFreightExpense(invoiceToEdit.internalFreightExpense ? invoiceToEdit.internalFreightExpense.toString() : '');
        setShowVendorDropdown(false);
        setWarehouseId(invoiceToEdit.warehouseId || '');
        setShowWarehouseDropdown(false);
        setRows((invoiceToEdit.items || []).map((it, idx) => ({
          id: idx.toString(),
          productSearch: it.name || '',
          showProductDropdown: false,
          showGstDropdown: false,
          selectedProduct: null,
          boxes: it.boxes !== undefined ? it.boxes.toString() : (it.qty || 0).toString(),
          packing: (it.packing || 1).toString(),
          rate: (it.rate || 0).toString(),
          gstRate: it.gstRate || 0
        })));
        setPaymentTermsDays('');
        setShowTermsDropdown(false);
        setOverridePaymentTerms(true);
      } else {
        setDate(new Date().toISOString().split('T')[0]);
        setDueDate('');
        setPaymentTermsDays('');
        setShowTermsDropdown(false);
        setInvoiceNo('');
        setSupplierName('');
        setStateOfSupply('Uttar Pradesh');
        setStatus('pending');

        setShowVendorDropdown(false);
        setWarehouseId('');
        setShowWarehouseDropdown(false);
        setFreightAmount('');
        setCartageAmount('');
        setTransport('');
        setVehicleNo('');
        setEwayBillNo('');
        setInternalFreightExpense('');
        setRows([{
          id: '1',
          productSearch: '',
          showProductDropdown: false,
          showGstDropdown: false,
          selectedProduct: null,
          boxes: '',
          packing: '1',
          rate: '',
          gstRate: 18
        }]);
        setOverridePaymentTerms(false);
      }

      const loadData = async () => {
        try {
          const [v, p, w] = await Promise.all([
            api.getVendors(),
            api.getProducts(),
            api.getWarehouses()
          ]);
          setVendors(v);
          setProducts(p);
          setWarehouses(w);
          if (w.length > 0 && !invoiceToEdit) {
            setWarehouseId(w[0]._id);
          }
          if (invoiceToEdit) {
            setRows((invoiceToEdit.items || []).map((it, idx) => {
              const matchedProd = p.find(prod => prod._id === it.productId) || null;
              return {
                id: idx.toString(),
                productSearch: it.name || '',
                showProductDropdown: false,
                showGstDropdown: false,
                selectedProduct: matchedProd,
                boxes: it.boxes !== undefined ? it.boxes.toString() : (it.qty || 0).toString(),
                packing: (it.packing || 1).toString(),
                rate: (it.rate || 0).toString(),
                gstRate: it.gstRate || 0
              };
            }));
          }
        } catch (err) {
          console.log('Failed to load vendors/products/warehouses for purchase invoice:', err);
        }
      };
      loadData();
    }
  }, [visible, invoiceToEdit]);

  const filteredVendors = supplierName
    ? vendors.filter(v =>
        (v.company || v.name || '').toLowerCase().includes(supplierName.toLowerCase()) ||
        (v.displayName || v.registeredName || '').toLowerCase().includes(supplierName.toLowerCase())
      )
    : vendors;

  const handleSelectVendor = (v: Vendor) => {
    const finalName = v.company || v.name;
    setSupplierName(finalName);
    if (v.state) {
      setStateOfSupply(v.state);
    }
    
    // Auto-calculate Due Date
    if (v.paymentTerms) {
      const match = v.paymentTerms.match(/\d+/);
      if (match) {
        const days = parseInt(match[0], 10);
        setPaymentTermsDays(days.toString());
        const invDate = new Date(date || Date.now());
        invDate.setDate(invDate.getDate() + days);
        setDueDate(invDate.toISOString().split('T')[0]);
      } else if (v.paymentTerms.toLowerCase().includes('receipt')) {
        setPaymentTermsDays('0');
        setDueDate(date || new Date().toISOString().split('T')[0]);
      } else {
        setPaymentTermsDays('');
      }
    } else {
      setPaymentTermsDays('');
    }
    
    setShowVendorDropdown(false);
  };

  const handlePaymentTermsChange = (val: string) => {
    setPaymentTermsDays(val);
    if (!val) {
      setDueDate('');
      return;
    }
    const days = parseInt(val, 10);
    const invDate = new Date(date || Date.now());
    invDate.setDate(invDate.getDate() + days);
    setDueDate(invDate.toISOString().split('T')[0]);
  };

  const addRow = () => {
    setRows(prev => [
      {
        id: Date.now().toString() + Math.random().toString(),
        productSearch: '',
        showProductDropdown: false,
        showGstDropdown: false,
        selectedProduct: null,
        boxes: '',
        packing: '1',
        rate: '',
        gstRate: 18
      },
      ...prev
    ]);
  };

  const removeRow = (id: string) => {
    if (rows.length === 1) {
      setRows([
        {
          id: '1',
          productSearch: '',
          showProductDropdown: false,
          showGstDropdown: false,
          selectedProduct: null,
          boxes: '',
          packing: '1',
          rate: '',
          gstRate: 18
        }
      ]);
    } else {
      setRows(prev => prev.filter(r => r.id !== id));
    }
  };

  const updateRowProductSearch = (id: string, text: string) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      return {
        ...r,
        productSearch: text,
        showProductDropdown: true,
        selectedProduct: null
      };
    }));
  };

  const handleSelectRowProduct = (id: string, p: Product) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const pGst = p.gstRate !== undefined ? p.gstRate : 18;
      return {
        ...r,
        selectedProduct: p,
        productSearch: getProductSelectorDisplayName(p),
        rate: p.price ? p.price.toString() : '',
        packing: '1',
        gstRate: mode === 'pakka' ? pGst : 0,
        showProductDropdown: false
      };
    }));
  };



  const stateCheck = (stateOfSupply || 'Uttar Pradesh').trim().toLowerCase();
  const isIntraState = stateCheck === 'uttar pradesh' || stateCheck === 'up';

  // Calculations
  let totalBase = 0;
  let totalGstAmount = 0;
  rows.forEach(r => {
    const boxes = parseFloat(r.boxes) || 0;
    const packing = parseFloat(r.packing) || 1;
    const rate = parseFloat(r.rate) || 0;
    const rowBase = boxes * packing * rate;
    totalBase += rowBase;
    totalGstAmount += (rowBase * r.gstRate) / 100;
  });

  const freightVal = parseFloat(freightAmount) || 0;
  const cartageVal = parseFloat(cartageAmount) || 0;
  if (freightVal > 0) {
    totalBase += freightVal;
    // Assuming standard 18% GST on freight
    totalGstAmount += (freightVal * 18) / 100;
  }
  if (cartageVal > 0) {
    totalBase += cartageVal;
    totalGstAmount += (cartageVal * 18) / 100;
  }

  let computedCGST = 0;
  let computedSGST = 0;
  let computedIGST = 0;

  if (isIntraState) {
    computedCGST = totalGstAmount / 2;
    computedSGST = totalGstAmount / 2;
  } else {
    computedIGST = totalGstAmount;
  }

  const rawTotal = totalBase + totalGstAmount;
  const computedTotal = Math.round(rawTotal);
  const roundOff = computedTotal - rawTotal;

  const handleSave = async () => {
    if (!supplierName.trim()) {
      alert('Supplier Name is required.');
      return;
    }

    if (!warehouseId) {
      alert('Please select a destination warehouse.');
      return;
    }

    if (mode === 'pakka' && !invoiceNo.trim()) {
      alert('Invoice Number is mandatory for GST purchases.');
      return;
    }

    const validRows = rows.filter(r => {
      const name = r.selectedProduct ? getProductSelectorDisplayName(r.selectedProduct) : r.productSearch.trim();
      const boxes = parseFloat(r.boxes) || 0;
      const rate = parseFloat(r.rate) || 0;
      return name && boxes > 0 && rate > 0;
    });

    if (validRows.length === 0) {
      alert('Please add at least one item with valid quantity and rate.');
      return;
    }

    const finalItems = validRows.map(r => {
      const boxes = parseFloat(r.boxes) || 0;
      const packing = parseFloat(r.packing) || 1;
      return {
        productId: r.selectedProduct ? r.selectedProduct._id : undefined,
        name: r.selectedProduct ? getProductSelectorDisplayName(r.selectedProduct) : r.productSearch.trim(),
        qty: boxes * packing,
        boxes: boxes,
        packing: packing,
        rate: parseFloat(r.rate) || 0,
        gstRate: r.gstRate,
        hsnCode: r.selectedProduct ? (r.selectedProduct.hsnCode || '') : ''
      };
    });

    // Find vendor's GSTIN and State from CRM seeds
    const targetVend = vendors.find(v => v.name.toLowerCase() === supplierName.toLowerCase() || v.company.toLowerCase() === supplierName.toLowerCase());
    const finalGstin = targetVend?.gstin || '';

    const targetWh = warehouses.find(w => w._id === warehouseId);
    const warehouseName = targetWh ? targetWh.name : '';

    const finalInvoiceNo = invoiceNo.trim();

    try {
      const payload: any = {
        invoiceNo: invoiceNo.trim() || undefined,
        date: date ? new Date(date).toISOString() : undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        supplierName: supplierName.trim() || 'Walk-in Supplier',
        amount: computedTotal,
        status,
        mode,
        freightAmount: parseFloat(freightAmount) || 0,
        cartageAmount: parseFloat(cartageAmount) || 0,
        transport: transport.trim(),
        vehicleNo: vehicleNo.trim(),
        ewayBillNo: ewayBillNo.trim(),
        internalFreightExpense: parseFloat(internalFreightExpense) || 0,
        baseAmount: totalBase,
        gstRate: finalItems.length === 1 ? finalItems[0].gstRate : undefined,
        cgst: computedCGST,
        sgst: computedSGST,
        igst: computedIGST,
        roundOff: roundOff,
        type: 'purchase',
        stateOfSupply: stateOfSupply.trim() || undefined,
        gstin: finalGstin,
        warehouseId,
        warehouseName,
        items: finalItems
      };

      if (invoiceToEdit) {
        await api.updatePurchaseInvoice(invoiceToEdit._id, payload);
      } else {
        await api.createPurchaseInvoice(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to save purchase invoice');
    }
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContainer}>

        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{invoiceToEdit ? 'Edit Purchase Invoice' : 'New Purchase Invoice'}</Text>
          <TouchableOpacity onPress={handleSave}>
            <Ionicons name="checkmark-circle" size={26} color={colors.success} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg }} keyboardShouldPersistTaps="handled">
          {(showWarehouseDropdown || showVendorDropdown || showTermsDropdown || rows.some(r => r.showProductDropdown || r.showGstDropdown)) && (
            <Pressable
              style={[
                StyleSheet.absoluteFill,
                { zIndex: showWarehouseDropdown ? 1019 : (showVendorDropdown ? 1009 : (showTermsDropdown ? 1005 : 999)) }
              ]}
              onPress={() => {
                setShowWarehouseDropdown(false);
                setShowVendorDropdown(false);
                setShowTermsDropdown(false);
                setRows(prev => prev.map(r => ({ ...r, showProductDropdown: false, showGstDropdown: false })));
              }}
            />
          )}


          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.formLabel}>Invoice Number *</Text>
              <View style={styles.formInput}>
                <Ionicons name="barcode" size={16} color={colors.text.muted} />
                <TextInput style={styles.formInputText} placeholder="e.g. INV-PURCH-8012" placeholderTextColor={colors.text.muted} value={invoiceNo} onChangeText={setInvoiceNo} />
              </View>
            </View>

            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.formLabel}>Date</Text>
              <View style={styles.formInput}>
                <Ionicons name="calendar-outline" size={16} color={colors.text.muted} />
                {Platform.OS === 'web' ? React.createElement('input', {
                  type: 'date',
                  value: date,
                  onChange: (e: any) => setDate(e.target.value),
                  style: { flex: 1, padding: 8, fontSize: 14, border: 'none', outline: 'none', backgroundColor: 'transparent', color: colors.text.primary }
                }) : (
                  <TextInput
                    style={styles.formInputText}
                    placeholder="YYYY-MM-DD"
                    value={date}
                    onChangeText={setDate}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Option to override default vendor payment terms */}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, marginTop: 4 }}
            onPress={() => setOverridePaymentTerms(!overridePaymentTerms)}
          >
            <Ionicons 
              name={overridePaymentTerms ? "checkbox" : "square-outline"} 
              size={18} 
              color={overridePaymentTerms ? colors.primary : colors.text.muted} 
            />
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary }}>
              Override default vendor payment terms
            </Text>
          </TouchableOpacity>

          {overridePaymentTerms && (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: -8, marginBottom: 12 }}>
              <View style={[styles.formGroup, { flex: 1, zIndex: 1015 }]}>
                <Text style={styles.formLabel}>Payment Terms</Text>
                <View style={styles.formInput}>
                  <Ionicons name="time-outline" size={16} color={colors.text.muted} />
                  {Platform.OS === 'web' ? React.createElement('select', {
                    value: paymentTermsDays,
                    onChange: (e: any) => handlePaymentTermsChange(e.target.value),
                    style: { flex: 1, padding: 8, fontSize: 14, border: 'none', outline: 'none', backgroundColor: 'transparent', color: colors.text.primary }
                  }, [
                    React.createElement('option', { value: '', key: 'none' }, 'Custom / Select...'),
                    React.createElement('option', { value: '0', key: '0' }, 'Due on Receipt'),
                    React.createElement('option', { value: '15', key: '15' }, '15 Days'),
                    React.createElement('option', { value: '30', key: '30' }, '30 Days'),
                    React.createElement('option', { value: '45', key: '45' }, '45 Days'),
                    React.createElement('option', { value: '60', key: '60' }, '60 Days'),
                    React.createElement('option', { value: '90', key: '90' }, '90 Days')
                  ]) : (
                    <>
                      <TouchableOpacity style={{ flex: 1, height: '100%', justifyContent: 'center' }} onPress={() => setShowTermsDropdown(!showTermsDropdown)}>
                        <Text style={{ color: paymentTermsDays ? colors.text.primary : colors.text.muted, fontSize: 14 }}>
                          {paymentTermsDays ? (paymentTermsDays === '0' ? 'Due on Receipt' : `${paymentTermsDays} Days`) : 'Select Terms...'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setShowTermsDropdown(!showTermsDropdown)}>
                        <Ionicons name={showTermsDropdown ? "chevron-up" : "chevron-down"} size={16} color={colors.text.muted} />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
                
                {showTermsDropdown && Platform.OS !== 'web' && (
                  <View style={[styles.customSelectPanel, { top: 75 }]}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                      {[
                        { val: '', label: 'Custom / Select...' },
                        { val: '0', label: 'Due on Receipt' },
                        { val: '15', label: '15 Days' },
                        { val: '30', label: '30 Days' },
                        { val: '45', label: '45 Days' },
                        { val: '60', label: '60 Days' },
                        { val: '90', label: '90 Days' },
                      ].map(t => (
                        <TouchableOpacity
                          key={t.val}
                          style={styles.customSelectItem}
                          onPress={() => {
                            handlePaymentTermsChange(t.val);
                            setShowTermsDropdown(false);
                          }}
                        >
                          <Text style={styles.customSelectItemText}>{t.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.formLabel}>Calculated Due Date</Text>
                <View style={[styles.formInput, { backgroundColor: colors.bg.secondary, borderColor: colors.border }]}>
                  <Ionicons name="calendar" size={16} color={colors.text.muted} />
                  <TextInput style={[styles.formInputText, { color: colors.text.muted }]} value={dueDate} editable={false} placeholder="Select terms..." />
                </View>
              </View>
            </View>
          )}

          {/* Destination Warehouse */}
          <View style={[styles.formGroup, { zIndex: 1020 }]}>
            <Text style={styles.formLabel}>Destination Warehouse *</Text>
            <View style={styles.customSearchSelectContainer}>
              <View style={styles.formInput}>
                <Ionicons name="business" size={16} color={colors.text.muted} />
                <TextInput
                  style={[styles.formInputText, { color: colors.text.primary }]}
                  placeholder="Select destination warehouse..."
                  placeholderTextColor={colors.text.muted}
                  value={warehouses.find(w => w._id === warehouseId)?.name || ''}
                  editable={false}
                />
                <TouchableOpacity onPress={() => setShowWarehouseDropdown(!showWarehouseDropdown)}>
                  <Ionicons name={showWarehouseDropdown ? "chevron-up" : "chevron-down"} size={18} color={colors.text.muted} />
                </TouchableOpacity>
              </View>
            </View>

            {showWarehouseDropdown && (
              <View style={styles.customSelectPanel}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                  {warehouses.map(w => (
                    <TouchableOpacity
                      key={w._id}
                      style={styles.customSelectItem}
                      onPress={() => {
                        setWarehouseId(w._id);
                        setShowWarehouseDropdown(false);
                      }}
                    >
                      <Text style={styles.customSelectItemText}>{w.name}</Text>
                      <Text style={styles.customSelectItemSubtext}>{w.city ? `${w.city}, ${w.state}` : 'Gotham Depot'}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>Status</Text>
              <View style={styles.formInput}>
                <Ionicons name="information-circle" size={16} color={colors.text.muted} />
                <TextInput
                  style={styles.formInputText}
                  value={status}
                  editable={false}
                />
              </View>
            </View>
          </View>

          {/* Supplier Name */}
          <View style={[styles.formGroup, { zIndex: 1010 }]}>
            <Text style={styles.formLabel}>Supplier Name *</Text>
            <View style={styles.customSearchSelectContainer}>
              <View style={styles.formInput}>
                <Ionicons name="person" size={16} color={colors.text.muted} />
                <TextInput
                  style={styles.formInputText}
                  placeholder="Search and select supplier..."
                  placeholderTextColor={colors.text.muted}
                  value={supplierName}
                  onChangeText={(val) => {
                    setSupplierName(val);
                    setShowVendorDropdown(true);
                  }}
                  onFocus={() => setShowVendorDropdown(true)}
                />
                {supplierName ? (
                  <TouchableOpacity onPress={() => { setSupplierName(''); setShowVendorDropdown(true); }}>
                    <Ionicons name="close-circle" size={18} color={colors.text.muted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {showVendorDropdown && (
              <View style={styles.customSelectPanel}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                  {filteredVendors.map(v => {
                    const vName = v.company || v.name;
                    return (
                      <TouchableOpacity
                        key={v._id}
                        style={styles.customSelectItem}
                        onPress={() => handleSelectVendor(v)}
                      >
                        <Text style={styles.customSelectItemText}>{vName}</Text>
                        <Text style={styles.customSelectItemSubtext}>
                          {v.gstin ? `GSTIN: ${v.gstin}` : 'Cash Supplier'}
                          {v.state ? ` | State: ${v.state}` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {filteredVendors.length === 0 && (
                    <View style={{ padding: 12 }}>
                      <Text style={{ fontSize: 12, color: colors.text.muted, textAlign: 'center' }}>
                        No suppliers found (typing custom name)
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={[styles.customSelectItem, { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg.secondary }]}
                    onPress={() => setShowVendorDropdown(false)}
                  >
                    <Text style={[styles.customSelectItemText, { color: colors.primary, textAlign: 'center' }]}>
                      ✓ Use typed custom name
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            )}
          </View>

          {/* Tabular Items Section */}
          <Text style={[styles.formLabel, { marginTop: 12, marginBottom: 8, fontSize: 13, color: colors.text.primary }]}>Items Breakdown *</Text>
          
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderLabel, { flex: 1.8 }]}>Product Name *</Text>
            <Text style={[styles.tableHeaderLabel, { flex: 0.8, textAlign: 'center' }]}>Boxes</Text>
            <Text style={[styles.tableHeaderLabel, { flex: 0.8, textAlign: 'center' }]}>Packing</Text>
            <Text style={[styles.tableHeaderLabel, { flex: 1.0, textAlign: 'right' }]}>Rate (₹)</Text>
            <Text style={[styles.tableHeaderLabel, { flex: 0.9, textAlign: 'center' }]}>GST</Text>
            <Text style={[styles.tableHeaderLabel, { flex: 1.0, textAlign: 'right' }]}>Total</Text>
            <View style={{ flex: 0.4 }} />
          </View>

          {rows.map((row, index) => {
            const boxesNum = parseFloat(row.boxes) || 0;
            const packingNum = parseFloat(row.packing) || 1;
            const subtotal = boxesNum * packingNum * (parseFloat(row.rate) || 0);
            const gstAmount = (subtotal * row.gstRate) / 100;
            const rowTotal = subtotal + gstAmount;

            const rowFilteredProducts = row.productSearch
              ? products.filter(p =>
                  getProductSelectorDisplayName(p).toLowerCase().includes(row.productSearch.toLowerCase()) ||
                  p.sku.toLowerCase().includes(row.productSearch.toLowerCase())
                )
              : products;

            return (
              <View key={row.id} style={[styles.tableRow, { zIndex: (row.showProductDropdown || row.showGstDropdown) ? 1000 : 100 - index }]}>
                {/* Product search */}
                <View style={{ flex: 1.8, position: 'relative' }}>
                  <TextInput
                    style={styles.tableInput}
                    placeholder="Search product..."
                    placeholderTextColor={colors.text.muted}
                    value={row.productSearch}
                    onChangeText={(text) => updateRowProductSearch(row.id, text)}
                    onFocus={() => {
                      setRows(prev => prev.map(r => r.id === row.id ? { ...r, showProductDropdown: true } : { ...r, showProductDropdown: false }));
                    }}
                  />
                  {row.showProductDropdown && (
                    <View style={styles.rowDropdown}>
                      <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                        {rowFilteredProducts.map(p => (
                          <TouchableOpacity
                            key={p._id}
                            style={styles.rowDropdownItem}
                            onPress={() => handleSelectRowProduct(row.id, p)}
                          >
                            <Text style={styles.rowDropdownItemText}>{getProductSelectorDisplayName(p)}</Text>
                            <Text style={styles.rowDropdownItemSubtext}>SKU: {p.sku} | GST: {p.gstRate}%</Text>
                          </TouchableOpacity>
                        ))}
                        {rowFilteredProducts.length === 0 && (
                          <View style={{ padding: 8 }}>
                            <Text style={{ fontSize: 11, color: colors.text.muted, textAlign: 'center' }}>No products found</Text>
                          </View>
                        )}
                        <TouchableOpacity
                          style={[styles.rowDropdownItem, { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg.secondary }]}
                          onPress={() => setRows(prev => prev.map(r => r.id === row.id ? { ...r, showProductDropdown: false } : r))}
                        >
                          <Text style={{ fontSize: 11, color: colors.primary, textAlign: 'center', fontWeight: 'bold' }}>Close</Text>
                        </TouchableOpacity>
                      </ScrollView>
                    </View>
                  )}
                </View>

                {/* Boxes */}
                <TextInput
                  style={[styles.tableInput, { flex: 0.8, textAlign: 'center' }]}
                  placeholder="0"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="numeric"
                  value={row.boxes}
                  onChangeText={(text) => {
                    setRows(prev => prev.map(r => r.id === row.id ? { ...r, boxes: text } : r));
                  }}
                />

                {/* Packing */}
                <TextInput
                  style={[styles.tableInput, { flex: 0.8, textAlign: 'center' }]}
                  placeholder="1"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="numeric"
                  value={row.packing}
                  onChangeText={(text) => {
                    setRows(prev => prev.map(r => r.id === row.id ? { ...r, packing: text } : r));
                  }}
                />

                {/* Rate */}
                <TextInput
                  style={[styles.tableInput, { flex: 1.0, textAlign: 'right' }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="numeric"
                  value={row.rate}
                  onChangeText={(text) => {
                    setRows(prev => prev.map(r => r.id === row.id ? { ...r, rate: text } : r));
                  }}
                />

                {/* GST */}
                <View style={{ flex: 0.9, position: 'relative' }}>
                  <View style={[styles.tableInputLocked, { width: '100%', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={styles.tableInputLockedText}>{row.gstRate}%</Text>
                  </View>
                </View>

                {/* Row Subtotal */}
                <View style={{ flex: 1.0, justifyContent: 'center', alignItems: 'flex-end' }}>
                  <Text style={styles.tableRowSubtotal} numberOfLines={1}>
                    ₹{rowTotal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </Text>
                </View>

                {/* Delete button */}
                <TouchableOpacity
                  style={{ flex: 0.4, alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => removeRow(row.id)}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            );
          })}

          <TouchableOpacity style={styles.addItemBtn} onPress={addRow}>
            <Ionicons name="add-circle" size={18} color={colors.primary} />
            <Text style={styles.addItemBtnText}>Add Product Line</Text>
          </TouchableOpacity>

          {/* Freight & Logistics Details */}
          <View style={{ backgroundColor: '#fdfdfd', padding: 14, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, marginTop: 10, marginBottom: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text.primary, marginBottom: 12 }}>
              Freight & Logistics Notes
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary, marginBottom: 8 }}>
              Charges Added in Vendor's Bill (Taxable)
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>Freight / Forwarding</Text>
                <View style={styles.formInput}>
                  <TextInput style={styles.formInputText} placeholder="0.00" keyboardType="numeric" value={freightAmount} onChangeText={setFreightAmount} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>Cartage / Loading</Text>
                <View style={styles.formInput}>
                  <TextInput style={styles.formInputText} placeholder="0.00" keyboardType="numeric" value={cartageAmount} onChangeText={setCartageAmount} />
                </View>
              </View>
            </View>

            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary, marginBottom: 8, marginTop: 4 }}>
              External Transport Details
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <View style={{ flex: 1.5 }}>
                <Text style={styles.formLabel}>Transporter Name</Text>
                <View style={styles.formInput}>
                  <TextInput style={styles.formInputText} placeholder="Transport Name" value={transport} onChangeText={setTransport} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>Vehicle No.</Text>
                <View style={styles.formInput}>
                  <TextInput style={styles.formInputText} placeholder="UP65..." value={vehicleNo} onChangeText={setVehicleNo} />
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>E-way Bill / GR No.</Text>
                <View style={styles.formInput}>
                  <TextInput style={styles.formInputText} placeholder="Doc No." value={ewayBillNo} onChangeText={setEwayBillNo} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>Freight Expense (Paid us)</Text>
                <View style={styles.formInput}>
                  <TextInput style={styles.formInputText} placeholder="0.00" keyboardType="numeric" value={internalFreightExpense} onChangeText={setInternalFreightExpense} />
                </View>
              </View>
            </View>
          </View>

          {/* Totals Summary */}
          {totalBase > 0 && (
            <View style={styles.gstCalculationPreview}>
              <Text style={styles.previewTitle}>Invoice Summary:</Text>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Total Base Value:</Text>
                <Text style={styles.previewValue}>₹{totalBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              </View>
              {freightVal > 0 && (
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Vendor Freight Added:</Text>
                  <Text style={styles.previewValue}>₹{freightVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                </View>
              )}
              {cartageVal > 0 && (
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Vendor Cartage Added:</Text>
                  <Text style={styles.previewValue}>₹{cartageVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                </View>
              )}
              {totalGstAmount > 0 && (
                <>
                  {isIntraState ? (
                    <>
                      <View style={styles.previewRow}>
                        <Text style={styles.previewLabel}>CGST (State Intra):</Text>
                        <Text style={styles.previewValue}>₹{computedCGST.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                      </View>
                      <View style={styles.previewRow}>
                        <Text style={styles.previewLabel}>SGST (State Intra):</Text>
                        <Text style={styles.previewValue}>₹{computedSGST.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabel}>IGST (Inter State):</Text>
                      <Text style={styles.previewValue}>₹{computedIGST.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                    </View>
                  )}
                </>
              )}
              <View style={styles.previewDivider} />
              <View style={styles.previewRow}>
                <Text style={[styles.previewLabel, { fontWeight: '800' }]}>Grand Total:</Text>
                <Text style={[styles.previewValue, { fontWeight: '800', color: colors.success }]}>
                  ₹{computedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
          )}

          {/* Status */}
          <Text style={[styles.formLabel, { marginTop: 16 }]}>Payment Status</Text>
          <View style={styles.statusSelector}>
            {['pending', 'paid'].map(s => (
              <TouchableOpacity key={s} style={[styles.statusBtn, status === s && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setStatus(s)}>
                <Text style={[styles.statusBtnText, status === s && { color: '#fff' }]}>{s.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const getOverdueText = (item: Invoice, vendors: Vendor[], colors: any) => {
  if (item.status === 'Cancelled') return { text: '-', color: colors.text.muted };
  if (!item.isFinalized) return { text: 'Draft', color: colors.text.muted };
  if (item.status?.toLowerCase() === 'paid') return { text: 'Paid', color: colors.success };

  let dueDate: Date;
  
  if (item.dueDate) {
    dueDate = new Date(item.dueDate);
  } else {
    const vendor = vendors.find(v => (v.company || v.name) === item.supplierName);
    const termsStr = vendor?.paymentTerms || 'Net 30';
    const match = termsStr.match(/\d+/);
    const termDays = match ? parseInt(match[0]) : 30;

    const invoiceDate = new Date(item.date);
    dueDate = new Date(invoiceDate.getTime() + termDays * 24 * 60 * 60 * 1000);
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - dueDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return { text: `Overdue by ${diffDays} day${diffDays > 1 ? 's' : ''}`, color: colors.danger };
  } else if (diffDays === 0) {
    return { text: 'Due Today', color: colors.warning };
  } else {
    const remainingDays = Math.abs(diffDays);
    return { text: `Due in ${remainingDays} day${remainingDays > 1 ? 's' : ''}`, color: colors.text.secondary };
  }
};

export default function PurchaseInvoicesScreen() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedInv, setSelectedInv] = useState<Invoice | null>(null);
  const [invoiceToEdit, setInvoiceToEdit] = useState<Invoice | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useStyles(createStyles);
  const canAccessCash = user?.canAccessCash ?? false;

  if (user && user.role === 'agent') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg.primary, padding: 20 }}>
        <Ionicons name="lock-closed" size={48} color={colors.danger} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary, marginTop: 12 }}>Access Denied</Text>
        <Text style={{ fontSize: 13, color: colors.text.muted, marginTop: 4, textAlign: 'center' }}>Agents do not have permissions to access purchase invoices.</Text>
      </View>
    );
  }

  const modeFilter = 'pakka';
  const [vendors, setVendors] = useState<Vendor[]>([]);

  const load = useCallback(async () => {
    const [res, vends] = await Promise.all([
      api.getPurchaseInvoices(search, modeFilter),
      api.getVendors()
    ]);
    setInvoices(res);
    setVendors(vends);
  }, [search, modeFilter]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={styles.screen}>
      <View style={styles.innerContainer}>
        <View style={{ zIndex: 1100, position: 'relative' }}>
          {showFilterDropdown && (
            <Pressable
              style={[
                StyleSheet.absoluteFill,
                { 
                  zIndex: 900,
                  ...(Platform.OS === 'web' ? { position: 'fixed' as any } : {})
                }
              ]}
              onPress={() => setShowFilterDropdown(false)}
            />
          )}
          <View style={[styles.searchBar, { paddingRight: 8, paddingLeft: 12 }]}>
            <Ionicons name="search" size={18} color={colors.text.muted} />
            <TextInput
              style={[styles.searchInput, { minWidth: 100 }]}
              placeholder="Search supplier bills..."
              placeholderTextColor={colors.text.muted}
              value={search}
              onChangeText={setSearch}
            />

            <TouchableOpacity style={styles.addBtn} onPress={() => { setInvoiceToEdit(null); setAddVisible(true); }}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

      <ScrollView style={{ flex: 1 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: Spacing.lg }}>
          <View style={styles.table}>
            {/* Table Header Row */}
            <View style={styles.tableHeaderRow}>
              <View style={[styles.tableHeaderCellContainer, { width: 160 }]}><Text style={styles.tableHeaderCell}>Invoice No</Text></View>
              <View style={[styles.tableHeaderCellContainer, { flex: 1, minWidth: 110 }]}><Text style={styles.tableHeaderCell}>Supplier Name</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 120 }]}><Text style={styles.tableHeaderCell}>Date</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 110 }]}><Text style={styles.tableHeaderCell}>Amount</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 120 }]}><Text style={styles.tableHeaderCell}>Doc Status</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 130 }]}><Text style={styles.tableHeaderCell}>Overdue Status</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 100, borderRightWidth: 0 }]}><Text style={[styles.tableHeaderCell, { textAlign: 'center' }]}>Action</Text></View>
            </View>

            {/* Table Body Rows */}
            {invoices.map((item) => {
              const overdueInfo = getOverdueText(item, vendors, colors);
              return (
              <TouchableOpacity key={item._id} style={styles.tableBodyRow} onPress={() => { setSelectedInv(item); setDetailVisible(true); }}>
                <View style={[styles.tableCellContainer, { width: 160 }]}>
                  <Text style={[styles.tableCell, { fontWeight: '700' }]} numberOfLines={1}>{item.invoiceNo}</Text>
                </View>
                <View style={[styles.tableCellContainer, { flex: 1, minWidth: 110 }]}>
                  <Text style={styles.tableCell} numberOfLines={1}>{item.supplierName || 'N/A'}</Text>
                </View>
                <View style={[styles.tableCellContainer, { width: 120 }]}>
                  <Text style={styles.tableCell}>{new Date(item.date).toLocaleDateString('en-IN')}</Text>
                </View>
                <View style={[styles.tableCellContainer, { width: 110 }]}>
                  <Text style={[styles.tableCell, { fontWeight: '800' }]}>₹{item.amount.toLocaleString()}</Text>
                </View>
                <View style={[styles.tableCellContainer, { width: 120 }]}>
                  <View style={[styles.statusBadge, {
                    borderColor: item.status === 'Cancelled' ? colors.danger : (item.isFinalized ? colors.success : colors.warning),
                    backgroundColor: (item.status === 'Cancelled' ? colors.danger : (item.isFinalized ? colors.success : colors.warning)) + '12'
                  }]}>
                    <Text style={[styles.statusText, {
                      color: item.status === 'Cancelled' ? colors.danger : (item.isFinalized ? colors.success : colors.warning)
                    }]}>{item.status === 'Cancelled' ? 'CANCELLED' : (item.isFinalized ? 'FINALIZED' : 'DRAFT')}</Text>
                  </View>
                </View>
                <View style={[styles.tableCellContainer, { width: 130 }]}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: overdueInfo.color }}>
                    {overdueInfo.text}
                  </Text>
                </View>
                <View style={[styles.tableCellContainer, { width: 100, borderRightWidth: 0, alignItems: 'center', justifyContent: 'center' }]}>
                  <TouchableOpacity 
                    style={{ backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6 }} 
                    onPress={() => { setSelectedInv(item); setDetailVisible(true); }}
                  >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>View</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )})}

            {invoices.length === 0 && (
              <View style={styles.emptyTableContainer}>
                <Ionicons name="folder-open-outline" size={28} color={colors.text.muted} />
                <Text style={styles.emptyText}>No invoices found</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </ScrollView>
      </View>

      <InvoiceDetailModal
        invoice={selectedInv}
        visible={detailVisible}
        onClose={() => { setDetailVisible(false); load(); }}
        onDeleted={load}
        onEdit={(inv) => {
          setInvoiceToEdit(inv);
          setAddVisible(true);
        }}
      />
      <AddInvoiceModal
        visible={addVisible}
        onClose={() => {
          setAddVisible(false);
          setInvoiceToEdit(null);
        }}
        onSaved={() => {
          load();
          setDetailVisible(false);
        }}
        invoiceToEdit={invoiceToEdit}
      />
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  innerContainer: { flex: 1, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.card, margin: Spacing.lg, marginBottom: 0, paddingHorizontal: 14, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, gap: 10 },
  searchInput: { flex: 1, height: 46, color: colors.text.primary, fontSize: 14 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  
  filterDropdownButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, height: 36, gap: 6 },
  filterDropdownButtonText: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  filterDropdownPanel: { position: 'absolute', backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, width: 200, zIndex: 9999, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 12 },
  filterDropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterDropdownItemActive: { backgroundColor: colors.primary + '08' },
  filterDropdownItemText: { fontSize: 13, color: colors.text.primary },

  emptyText: { color: colors.text.muted, textAlign: 'center', marginTop: 40, fontSize: 13 },

  table: { flex: 1, backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start', marginVertical: Spacing.md, overflow: 'hidden' },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  tableHeaderCell: { fontSize: 11, fontWeight: '800', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableHeaderCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  tableBodyRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  tableCell: { fontSize: 13, color: colors.text.primary },
  tableCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  primaryText: { fontSize: 13, fontWeight: '700', color: colors.text.primary },
  secondaryText: { fontSize: 10, color: colors.text.muted, marginTop: 1 },
  outstandingText: { fontSize: 13, fontWeight: '800' },
  actionIconButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  emptyTableContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontWeight: '800' },

  modalContainer: { flex: 1, backgroundColor: colors.bg.primary, width: '100%', maxWidth: 950, alignSelf: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.text.primary },
  profileHeader: { alignItems: 'center', marginBottom: 20, marginTop: 10 },
  profileAvatar: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.purple + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  profileName: { fontSize: 22, fontWeight: '800', color: colors.text.primary },
  profileSupplier: { fontSize: 14, color: colors.text.secondary },
  infoGrid: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.lg, gap: 16 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 11, color: colors.text.muted, fontWeight: '600' },
  infoValue: { fontSize: 14, color: colors.text.primary, fontWeight: '500' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.danger, borderRadius: Radius.md, paddingVertical: 12, marginTop: 24, marginBottom: 16 },
  deleteBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 12, fontWeight: '700', color: colors.text.secondary, marginBottom: 6 },
  formInput: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 },
  formInputText: { flex: 1, height: 46, color: colors.text.primary, fontSize: 14 },
  statusSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  statusBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.card },
  statusBtnText: { fontSize: 11, fontWeight: '700', color: colors.text.secondary },

  modeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start' },
  modeText: { fontSize: 8, fontWeight: '800' },
  modeSelector: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 16 },
  modeBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.card },
  modeBtnText: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },

  filterTabContainer: { flexDirection: 'row', paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: 8 },
  filterTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.card },
  filterTabText: { fontSize: 12, fontWeight: '500' },

  gstCalculationPreview: { marginTop: 16, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.secondary },
  previewTitle: { fontSize: 12, fontWeight: '700', color: colors.text.primary, marginBottom: 8 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  previewLabel: { fontSize: 12, color: colors.text.secondary },
  previewValue: { fontSize: 12, fontWeight: '600', color: colors.text.primary },
  previewDivider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },

  // Dropdown search panel selector additions
  customSearchSelectContainer: { position: 'relative', width: '100%' },
  customSelectPanel: { position: 'absolute', top: 50, left: 0, right: 0, backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, zIndex: 2000, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 },
  customSelectItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  customSelectItemText: { fontSize: 13, fontWeight: '700', color: colors.text.primary },
  customSelectItemSubtext: { fontSize: 10, color: colors.text.muted, marginTop: 2 },

  // New Tabular Items & Detail table styles
  addItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.primary, borderRadius: Radius.md, paddingVertical: 10, marginTop: 14, marginBottom: 10, borderStyle: 'dashed' },
  addItemBtnText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8, paddingHorizontal: 4, backgroundColor: colors.bg.secondary, borderRadius: Radius.sm, marginBottom: 8 },
  tableHeaderLabel: { fontSize: 11, fontWeight: '700', color: colors.text.muted },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border + '50', paddingHorizontal: 4 },
  tableInput: { height: 36, backgroundColor: colors.bg.card, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, fontSize: 13, color: colors.text.primary },
  tableInputLocked: { height: 36, backgroundColor: colors.bg.secondary, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  tableInputLockedText: { fontSize: 13, color: colors.text.muted, fontWeight: '600' },
  tableInputBtn: { height: 36, backgroundColor: colors.bg.card, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  tableInputBtnText: { fontSize: 13, color: colors.text.primary, fontWeight: '600' },
  tableRowSubtotal: { fontSize: 12, fontWeight: '600', color: colors.text.primary },
  
  rowDropdown: { position: 'absolute', top: 40, left: 0, right: 0, backgroundColor: colors.bg.card, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border, zIndex: 3000, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 5 },
  rowDropdownItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowDropdownItemText: { fontSize: 12, fontWeight: '700', color: colors.text.primary },
  rowDropdownItemSubtext: { fontSize: 9, color: colors.text.muted, marginTop: 1 },

  rowGstDropdown: { position: 'absolute', top: 40, left: 0, right: 0, backgroundColor: colors.bg.card, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border, zIndex: 3000, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 5 },
  rowGstDropdownItem: { padding: 8, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  rowGstDropdownItemText: { fontSize: 12, fontWeight: '600', color: colors.text.primary },

  detailTable: { backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  detailTableHeader: { flexDirection: 'row', backgroundColor: colors.bg.secondary, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 10, paddingHorizontal: 12 },
  detailTableHeaderCell: { fontSize: 11, fontWeight: '700', color: colors.text.muted },
  detailTableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border + '50', paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' },
  detailTableCell: { fontSize: 12, color: colors.text.primary },
  printBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2563eb', borderRadius: Radius.md, paddingVertical: 13, marginTop: 24, marginBottom: 8 },
  printBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' }
});
