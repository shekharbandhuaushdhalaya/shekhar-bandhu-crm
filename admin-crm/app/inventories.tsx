import { ListToolbar } from '../components/ListToolbar';
import { PageHeader } from '../components/PageHeader';
import { DataTable, Column } from '../components/DataTable';
import { useListState } from '../utils/useListState';
import { useLocalSearchParams } from 'expo-router';
import { StatusPill, EmptyState } from './../components/WorkspacePrimitives';
import { PressableOpacity as TouchableOpacity } from './../components/PressableOpacity';
import { AppTextInput as TextInput } from './../components/AppTextInput';
import { AppText as Text } from './../components/AppText';
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Modal, KeyboardAvoidingView, Platform, Pressable, DeviceEventEmitter, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, Shadows, LightColors, Typography, getStatusTone } from '../constants/theme';
import { useToast } from '../utils/ToastContext';
import { useConfirm } from '../utils/ConfirmContext';
import { api, Warehouse, InventoryEntry, ConsolidatedInventory, StockLedger, Product, DeadStockItem } from '../utils/api';
import { useAuth } from '../utils/auth';
import { useDebouncedValue } from '../utils/useDebouncedValue';
import { usePermission } from '../utils/permissions';
import { useTheme, useStyles } from '../utils/themeContext';


// Helper to format strings to Upper Camel Case (Title Case)
const toTitleCase = (str?: string) => {
  if (!str) return '';
  return str
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

// Formatter for size with no spaces, capitalized unit suffix, and a trailing dot
const formatSize = (size?: string) => {
  if (!size) return '';
  // Remove all spaces and dots to normalize, convert to uppercase
  const cleaned = size.replace(/[\s.]+/g, '').toUpperCase();
  return cleaned ? `${cleaned}.` : '';
};

// Formatter for weight with no spaces, normalized suffix, and lowercase 'g' (e.g. 12.50 gms -> 12.50g)
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

// Helper to compare sizes for sorting in increasing order
const compareSizes = (aSize?: string, bSize?: string) => {
  if (!aSize && !bSize) return 0;
  if (!aSize) return 1; // Put empty/missing sizes at the end
  if (!bSize) return -1;

  // Extract numeric parts to compare them as numbers (natural sort)
  // E.g. "19MM" -> 19, "25MM" -> 25, "9.5" -> 9.5
  const aNum = parseFloat(aSize.replace(/[^\d.]/g, ''));
  const bNum = parseFloat(bSize.replace(/[^\d.]/g, ''));

  if (!isNaN(aNum) && !isNaN(bNum)) {
    if (aNum !== bNum) {
      return aNum - bNum;
    }
  }

  // Fallback to alphabetical comparison
  return aSize.localeCompare(bSize, undefined, { numeric: true, sensitivity: 'base' });
};

// Formatter for full item name in Title Case
const getDisplayName = (item: { productType?: string; size?: string; colour?: string; shape?: string; weight?: string; name?: string; itemName?: string; productId?: string }, products: Product[] = []) => {
  const p = products.find(prod => prod._id === item.productId);
  if (p && p.name) {
    const sizeStr = (p.size && !p.name.toLowerCase().includes(p.size.toLowerCase())) ? ` (${p.size})` : '';
    return `${p.name}${sizeStr}`;
  }
  const name = item.name || item.itemName;
  if (name) {
    const sizeStr = (item.size && !name.toLowerCase().includes(item.size.toLowerCase())) ? ` (${item.size})` : '';
    return `${name}${sizeStr}`;
  }
  const parts = [
    item.size,
    item.shape,
    item.colour,
    item.weight
  ];
  const combined = parts.filter(Boolean).join(' ');
  return combined || item.productType || 'Unnamed Product';
};

const getProductSelectorDisplayName = (item: { size?: string; shape?: string; colour?: string; weight?: string; name?: string }) => {
  if (item.name) {
    const sizeStr = (item.size && !item.name.toLowerCase().includes(item.size.toLowerCase())) ? ` (${item.size})` : '';
    return `${item.name}${sizeStr}`;
  }
  const parts = [
    item.size,
    item.shape,
    item.colour,
    item.weight
  ];
  const combined = parts.filter(Boolean).join(' ');
  return combined || 'Unnamed Product';
};

const formatVendorDisplay = (vName?: string) => {
  if (!vName || vName.trim() === '') return 'Self (In-House)';
  const lower = vName.toLowerCase();
  if (lower.includes('in-house') || lower.includes('self') || lower.includes('shekhar bandhu')) {
    return 'Self (In-House)';
  }
  return toTitleCase(vName);
};


// Helper to format stock in boxes & pieces
const formatStock = (qtyBoxes: number, packing: number = 1, showSign: boolean = false, compact: boolean = false) => {
  const totalPcs = Math.round(Math.abs(qtyBoxes) * packing);
  const isNegative = qtyBoxes < 0;
  const sign = isNegative ? '-' : (showSign ? '+' : '');
  if (compact) {
    return `${sign}${totalPcs}p`;
  }
  return `${sign}${totalPcs} Pc${totalPcs !== 1 ? 's' : ''}`;
};

// Component to beautifully display stock split into Boxes and Loose Change
const StockDisplay = ({ qtyBoxes, packing = 1, showSign = false, textStyle = {} }: any) => {
  const { colors } = useTheme();
  const totalPcs = Math.round(Math.abs(qtyBoxes) * packing);
  const isNegative = qtyBoxes < 0;
  const sign = isNegative ? '-' : (showSign ? '+' : '');
  const color = isNegative ? colors.danger : (totalPcs === 0 ? colors.text.muted : colors.success);
  return (
    <Text style={[textStyle, { color, fontWeight: '800' }]}>
      {sign}{totalPcs} <Text style={{ ...Typography.caption, fontWeight: '600' }}>Pcs</Text>
    </Text>
  );
};


// 1. Add Warehouse Modal Component
function AddWarehouseModal({ visible, onClose, onSaved, warehouse }: { visible: boolean; onClose: () => void; onSaved: () => void; warehouse?: Warehouse | null }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [name, setName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setName(warehouse?.name || '');
      setAddressLine1(warehouse?.addressLine1 || '');
      setAddressLine2(warehouse?.addressLine2 || '');
      setCity(warehouse?.city || '');
      setState(warehouse?.state || '');
      setPincode(warehouse?.pincode || '');
      setContactPerson(warehouse?.contactPerson || '');
      setPhone(warehouse?.phone || '');
      setError('');
    }
  }, [visible, warehouse]);

  const handlePinChange = async (val: string) => {
    setPincode(val);
    if (val.length === 6 && /^\d+$/.test(val)) {
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${val}`);
        const data = await res.json();
        if (data && data[0] && data[0].Status === 'Success') {
          const postOffice = data[0].PostOffice[0];
          setCity(postOffice.District || postOffice.Name || '');
          setState(postOffice.State || '');
        }
      } catch (err) {
        console.log('PIN fetch error:', err);
      }
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Warehouse Name is required');
      return;
    }
    if (!addressLine1.trim() || !city.trim() || !state.trim() || !pincode.trim()) {
      setError('Full address (Address line 1, City, State, Pincode) is required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        contactPerson: contactPerson.trim(),
        phone: phone.trim()
      };
      
      if (warehouse && warehouse._id) {
        await api.updateWarehouse(warehouse._id, payload);
      } else {
        await api.createWarehouse(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create warehouse');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!warehouse || !warehouse._id) return;
    confirm({
      title: 'Delete Warehouse?',
      description: `Are you sure you want to delete ${warehouse.name}?`,
      destructive: true,
      confirmLabel: 'Delete',
      iconName: 'trash-outline',
      onConfirm: async () => {
        setLoading(true);
        setError('');
        try {
          await api.deleteWarehouse(warehouse._id);
          showToast('Warehouse deleted', 'success');
          onSaved();
          onClose();
        } catch (err: any) {
          setError(err.message || 'Failed to delete warehouse');
          showToast(err.message || 'Failed to delete warehouse', 'error');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.dialogSheet}>
          <Pressable style={styles.dialogContainer}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>{warehouse ? 'Edit Warehouse' : 'Add New Warehouse'}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={colors.text.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400, marginVertical: Spacing.sm }} showsVerticalScrollIndicator={true}>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Warehouse Name *</Text>
                <TextInput style={styles.formInput} placeholder="e.g. Gotham Depot A" placeholderTextColor={colors.text.muted} value={name} onChangeText={setName} />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Address Line 1 *</Text>
                <TextInput style={styles.formInput} placeholder="Street address, P.O. box" placeholderTextColor={colors.text.muted} value={addressLine1} onChangeText={setAddressLine1} />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Address Line 2 (Optional)</Text>
                <TextInput style={styles.formInput} placeholder="Apartment, suite, unit, building" placeholderTextColor={colors.text.muted} value={addressLine2} onChangeText={setAddressLine2} />
              </View>

              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.formLabel}>City *</Text>
                  <TextInput style={styles.formInput} placeholder="City" placeholderTextColor={colors.text.muted} value={city} onChangeText={setCity} />
                </View>
                <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
                  <Text style={styles.formLabel}>State *</Text>
                  <TextInput style={styles.formInput} placeholder="State" placeholderTextColor={colors.text.muted} value={state} onChangeText={setState} />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.formLabel}>Pincode *</Text>
                  <TextInput style={styles.formInput} placeholder="Pincode" placeholderTextColor={colors.text.muted} keyboardType="numeric" value={pincode} onChangeText={handlePinChange} />
                </View>
                <View style={[styles.formGroup, { flex: 1, marginLeft: 10 }]}>
                  <Text style={styles.formLabel}>Contact Person</Text>
                  <TextInput style={styles.formInput} placeholder="Name" placeholderTextColor={colors.text.muted} value={contactPerson} onChangeText={setContactPerson} />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Phone Number</Text>
                <TextInput style={styles.formInput} placeholder="Phone" placeholderTextColor={colors.text.muted} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
              </View>
            </ScrollView>

            <View style={styles.dialogActions}>
              {warehouse && warehouse._id ? (
                <TouchableOpacity style={[styles.dialogCancel, { borderColor: colors.danger, marginRight: 'auto' }]} onPress={handleDelete} disabled={loading}>
                  <Text style={{ color: colors.danger }}>Delete</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.dialogCancel} onPress={onClose} disabled={loading}>
                <Text style={{ color: colors.text.secondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogSave, loading && { opacity: 0.7 }]} onPress={handleSave} disabled={loading}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{loading ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// 2. Add Stock (IN Transaction) Modal Component
function AddStockModal({ visible, initialProductId, onClose, onSaved, warehouses, products, vendors }: { visible: boolean; initialProductId?: string; onClose: () => void; onSaved: () => void; warehouses: Warehouse[]; products: Product[]; vendors: any[] }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuth();

  const [warehouseId, setWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [qtyBoxes, setQtyBoxes] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [packing, setPacking] = useState('1');
  const [date, setDate] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [mfgDate, setMfgDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-suggest products & vendors as the user searches
  const [productSearch, setProductSearch] = useState('');
  const [vendorSearch, setVendorSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showWarehouseDropdown, setShowWarehouseDropdown] = useState(false);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);

  useEffect(() => {
    if (visible) {
      setWarehouseId(warehouses[0]?._id || '');
      setProductId(initialProductId || '');
      setProductSearch('');
      setQtyBoxes('');
      setReference('');
      setNote('');
      setVendorId('');
      setVendorName('');
      setVendorSearch('');
      setPacking('1');
      setDate(new Date().toISOString().split('T')[0]);
      setBatchNo('');
      setMfgDate('');
      setExpiryDate('');
      setError('');
      setShowProductDropdown(false);
      setShowWarehouseDropdown(false);
      setShowVendorDropdown(false);
    }
  }, [visible, warehouses]);

  const filteredProducts = productSearch
    ? products.filter(p => getProductSelectorDisplayName(p).toLowerCase().includes(productSearch.toLowerCase()) || p.sku.toLowerCase().includes(productSearch.toLowerCase()))
    : products;

  const filteredVendors = vendorSearch
    ? vendors.filter(v => (v.displayName || v.name || '').toLowerCase().includes(vendorSearch.toLowerCase()) || (v.company || '').toLowerCase().includes(vendorSearch.toLowerCase()))
    : vendors;

  const handleSave = async () => {
    if (!warehouseId) {
      setError('Please select a warehouse');
      return;
    }
    if (!productId) {
      setError('Please select a product');
      return;
    }
    const qty = parseFloat(qtyBoxes);
    if (isNaN(qty) || qty <= 0) {
      setError('Please enter a valid positive quantity in Pcs');
      return;
    }
    const packVal = 1; // Always track in Pcs (packing = 1)
    // Issue #8: Warn if dates are set without a batch number
    if ((mfgDate || expiryDate) && !batchNo.trim()) {
      setError('Please enter a Batch Number when specifying Mfg/Expiry dates — batch dates without a batch number reduce traceability.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api.addStock({
        warehouseId,
        productId,
        qtyBoxes: qty,
        reference: reference.trim(),
        note: note.trim(),
        createdBy: user?.name || '',
        vendorId,
        vendorName: vendorName.trim(),
        packing: packVal,
        batchNo: batchNo.trim(),
        mfgDate: mfgDate || undefined,
        expiryDate: expiryDate || undefined,
        createdAt: date ? new Date(date).toISOString() : undefined
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add stock');
    } finally {
      setLoading(false);
    }
  };

  const selectedProductObj = products.find(p => p._id === productId);
  const selectedWarehouseObj = warehouses.find(w => w._id === warehouseId);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={() => {
        setShowWarehouseDropdown(false);
        setShowProductDropdown(false);
        setShowVendorDropdown(false);
        onClose();
      }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.dialogSheet}>
          <Pressable style={styles.dialogContainer}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Add Stock (IN)</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={colors.text.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, marginVertical: Spacing.sm }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {/* Warehouse Dropdown */}
              <View style={[styles.formGroup, { zIndex: 1010 }]}>
                <Text style={styles.formLabel}>Destination Warehouse *</Text>
                <TouchableOpacity style={styles.customSelectTrigger} onPress={() => { setShowWarehouseDropdown(!showWarehouseDropdown); setShowProductDropdown(false); setShowVendorDropdown(false); }}>
                  <Text style={{ color: selectedWarehouseObj ? colors.text.primary : colors.text.muted }}>
                    {selectedWarehouseObj ? selectedWarehouseObj.name : 'Select Warehouse'}
                  </Text>
                  <Ionicons name={showWarehouseDropdown ? 'chevron-up' : 'chevron-down'} size={16} color={colors.text.muted} />
                </TouchableOpacity>

                {showWarehouseDropdown && (
                  <View style={styles.customSelectPanel}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }}>
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
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Product Selection with Instant Search */}
              <View style={[styles.formGroup, { zIndex: 1000 }]}>
                <Text style={styles.formLabel}>Select Product *</Text>
                <View style={styles.customSearchSelectContainer}>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Search by name, type, SKU..."
                    placeholderTextColor={colors.text.muted}
                    value={productSearch || (selectedProductObj ? getProductSelectorDisplayName(selectedProductObj) : '')}
                    onChangeText={(val) => {
                      setProductSearch(val);
                      setShowProductDropdown(true);
                      setShowWarehouseDropdown(false);
                      setShowVendorDropdown(false);
                      if (productId) setProductId('');
                    }}
                    onFocus={() => {
                      setShowProductDropdown(true);
                      setShowWarehouseDropdown(false);
                      setShowVendorDropdown(false);
                    }}
                  />
                  {productId ? (
                    <TouchableOpacity style={styles.clearProductSelection} onPress={() => { setProductId(''); setProductSearch(''); setVendorId(''); setVendorName(''); }}>
                      <Ionicons name="close-circle" size={18} color={colors.text.muted} />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {showProductDropdown && (
                  <View style={styles.customSelectPanel}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}>
                      {filteredProducts.map(p => (
                        <TouchableOpacity
                          key={p._id}
                          style={styles.customSelectItem}
                          onPress={() => {
                            setProductId(p._id);
                            setProductSearch(getProductSelectorDisplayName(p));
                            if (p.vendorId) setVendorId(p.vendorId);
                            if (p.vendorName) setVendorName(p.vendorName);
                            setVendorSearch('');
                            setShowProductDropdown(false);
                          }}
                        >
                          <Text style={styles.customSelectItemText}>{getProductSelectorDisplayName(p)}</Text>
                          <Text style={styles.customSelectItemSubtext}>SKU: {p.sku} | Default Vendor: {toTitleCase(p.vendorName) || 'None'}</Text>
                        </TouchableOpacity>
                      ))}
                      {filteredProducts.length === 0 && (
                        <View style={{ padding: 12 }}>
                          <Text style={{ ...Typography.bodySm, color: colors.text.muted, textAlign: 'center' }}>No products found</Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Vendor Selection with Instant Search */}
              <View style={[styles.formGroup, { zIndex: 990 }]}>
                <Text style={styles.formLabel}>Select Vendor</Text>
                <View style={styles.customSearchSelectContainer}>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Search vendor or type custom..."
                    placeholderTextColor={colors.text.muted}
                    value={vendorSearch || toTitleCase(vendorName)}
                    onChangeText={(val) => {
                      setVendorSearch(val);
                      setVendorName(val);
                      setShowVendorDropdown(true);
                      setShowProductDropdown(false);
                      setShowWarehouseDropdown(false);
                      if (vendorId) setVendorId('');
                    }}
                    onFocus={() => {
                      setShowVendorDropdown(true);
                      setShowProductDropdown(false);
                      setShowWarehouseDropdown(false);
                    }}
                  />
                  {vendorId || vendorName ? (
                    <TouchableOpacity style={styles.clearProductSelection} onPress={() => { setVendorId(''); setVendorName(''); setVendorSearch(''); }}>
                      <Ionicons name="close-circle" size={18} color={colors.text.muted} />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {showVendorDropdown && (
                  <View style={styles.customSelectPanel}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }}>
                      {filteredVendors.map(v => (
                        <TouchableOpacity
                          key={v._id}
                          style={styles.customSelectItem}
                          onPress={() => {
                            setVendorId(v._id);
                            setVendorName(v.displayName || v.name || '');
                            setVendorSearch('');
                            setShowVendorDropdown(false);
                          }}
                        >
                          <Text style={styles.customSelectItemText}>{v.displayName || v.name}</Text>
                          {v.company ? <Text style={styles.customSelectItemSubtext}>{v.company}</Text> : null}
                        </TouchableOpacity>
                      ))}
                      {filteredVendors.length === 0 && (
                        <View style={{ padding: 12 }}>
                          <Text style={{ ...Typography.bodySm, color: colors.text.muted, textAlign: 'center' }}>No vendors found</Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Quantity (Pcs) *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. 500"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="numeric"
                  value={qtyBoxes}
                  onChangeText={setQtyBoxes}
                />
              </View>

              {/* Manufacturing Batch Details */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Batch Number (e.g. B-MUST-09)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. B-MUST-09"
                  placeholderTextColor={colors.text.muted}
                  value={batchNo}
                  onChangeText={setBatchNo}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.formLabel}>Mfg Date (Optional)</Text>
                  {Platform.OS === 'web' ? (
                    React.createElement('input', {
                      type: 'date',
                      value: mfgDate,
                      onChange: (e: any) => setMfgDate(e.target.value),
                      style: { ...Typography.body, padding: 8, borderRadius: 6, border: '1px solid #ccc' }
                    })
                  ) : (
                    <TextInput
                      style={styles.formInput}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.text.muted}
                      value={mfgDate}
                      onChangeText={setMfgDate}
                    />
                  )}
                </View>

                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.formLabel}>Expiry Date (Optional)</Text>
                  {Platform.OS === 'web' ? (
                    React.createElement('input', {
                      type: 'date',
                      value: expiryDate,
                      onChange: (e: any) => setExpiryDate(e.target.value),
                      style: { ...Typography.body, padding: 8, borderRadius: 6, border: '1px solid #ccc' }
                    })
                  ) : (
                    <TextInput
                      style={styles.formInput}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.text.muted}
                      value={expiryDate}
                      onChangeText={setExpiryDate}
                    />
                  )}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Date (Optional backdating)</Text>
                {Platform.OS === 'web' ? (
                  React.createElement('input', {
                    type: 'date',
                    value: date,
                    onChange: (e: any) => setDate(e.target.value),
                    style: { ...Typography.body, padding: 8, borderRadius: 6, border: '1px solid #ccc' }
                  })
                ) : (
                  <TextInput
                    style={styles.formInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.text.muted}
                    value={date}
                    onChangeText={setDate}
                  />
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Reference (Challan # / Invoice #)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. DC-2026-88"
                  placeholderTextColor={colors.text.muted}
                  value={reference}
                  onChangeText={setReference}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Note</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Additional transaction info"
                  placeholderTextColor={colors.text.muted}
                  value={note}
                  onChangeText={setNote}
                />
              </View>
            </ScrollView>

            <View style={[styles.dialogActions, { marginTop: 16 }]}>
              <TouchableOpacity style={styles.dialogCancel} onPress={onClose} disabled={loading}>
                <Text style={{ color: colors.text.secondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogSave, loading && { opacity: 0.7 }]} onPress={handleSave} disabled={loading}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{loading ? 'Adding...' : 'Add Stock'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// 3. Adjust Stock Modal Component (for Adjusting particular Warehouse Entry)
function AdjustStockModal({ visible, entry, onClose, onSaved, products }: { visible: boolean; entry: InventoryEntry | null; onClose: () => void; onSaved: () => void; products: Product[] }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuth();

  const [type, setType] = useState<'IN' | 'OUT' | 'ADJUSTMENT'>('ADJUSTMENT');
  const [qtyBoxes, setQtyBoxes] = useState('');
  const [qtyPieces, setQtyPieces] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const packSize = entry?.packing || 1;

  // Sync helpers
  const handleBoxesChange = (val: string) => {
    setQtyBoxes(val);
    const b = parseFloat(val);
    if (!isNaN(b)) {
      setQtyPieces((b * packSize).toString());
    } else {
      setQtyPieces('');
    }
  };

  const handlePiecesChange = (val: string) => {
    setQtyPieces(val);
    const p = parseFloat(val);
    if (!isNaN(p)) {
      // Round to 3 decimal places for box conversion
      setQtyBoxes(parseFloat((p / packSize).toFixed(3)).toString());
    } else {
      setQtyBoxes('');
    }
  };

  useEffect(() => {
    if (visible && entry) {
      setType('ADJUSTMENT');
      setQtyBoxes(entry.qtyBoxes.toString());
      setQtyPieces((entry.qtyBoxes * (entry.packing || 1)).toString());
      setReference('');
      setNote('');
      setDate(new Date().toISOString().split('T')[0]);
      setError('');
    }
  }, [visible, entry]);

  if (!entry) return null;

  const handleSave = async () => {
    const qty = parseFloat(qtyBoxes);
    if (isNaN(qty) || qty < 0) {
      setError('Please enter a valid non-negative quantity of pieces');
      return;
    }
    if (type === 'OUT' && qty > entry.qtyBoxes) {
      setError(`Cannot deduct more than current stock (${formatStock(entry.qtyBoxes, entry.packing)})`);
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api.adjustStock(entry._id, {
        qtyBoxes: qty,
        type,
        reference: reference.trim(),
        note: note.trim(),
        createdBy: user?.name || '',
        createdAt: date ? new Date(date).toISOString() : undefined
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to adjust stock');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.dialogSheet}>
          <Pressable style={styles.dialogContainer}>
            <View style={styles.dialogHeader}>
              <View>
                <Text style={styles.dialogTitle}>Adjust Stock Level</Text>
                <Text style={{ ...Typography.caption, color: colors.text.muted }}>{entry.warehouseName} | {getDisplayName(entry, products)} (Current: {formatStock(entry.qtyBoxes, entry.packing)})</Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={colors.text.muted} />
              </TouchableOpacity>
            </View>

            <View style={{ marginVertical: Spacing.sm }}>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {/* Adjustment Type Selector */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Adjustment Type</Text>
                <View style={styles.adjustmentTypeContainer}>
                  <TouchableOpacity
                    style={[styles.adjustmentTypeBtn, type === 'IN' && { backgroundColor: colors.success + '20', borderColor: colors.success }]}
                    onPress={() => { setType('IN'); setQtyBoxes(''); setQtyPieces(''); }}
                  >
                    <Ionicons name="add-circle" size={16} color={type === 'IN' ? colors.success : colors.text.muted} />
                    <Text style={[styles.adjustmentTypeBtnText, type === 'IN' && { color: colors.success }]}>Add (IN)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.adjustmentTypeBtn, type === 'OUT' && { backgroundColor: colors.danger + '20', borderColor: colors.danger }]}
                    onPress={() => { setType('OUT'); setQtyBoxes(''); setQtyPieces(''); }}
                  >
                    <Ionicons name="remove-circle" size={16} color={type === 'OUT' ? colors.danger : colors.text.muted} />
                    <Text style={[styles.adjustmentTypeBtnText, type === 'OUT' && { color: colors.danger }]}>Deduct (OUT)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.adjustmentTypeBtn, type === 'ADJUSTMENT' && { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
                    onPress={() => {
                      setType('ADJUSTMENT');
                      setQtyBoxes(entry.qtyBoxes.toString());
                      setQtyPieces((entry.qtyBoxes * packSize).toString());
                    }}
                  >
                    <Ionicons name="options" size={16} color={type === 'ADJUSTMENT' ? colors.primary : colors.text.muted} />
                    <Text style={[styles.adjustmentTypeBtnText, type === 'ADJUSTMENT' && { color: colors.primary }]}>Set Total</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Single Pcs input */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>
                  {type === 'IN' && 'Pcs to Add'}
                  {type === 'OUT' && 'Pcs to Deduct'}
                  {type === 'ADJUSTMENT' && 'New Total (Pcs)'} *
                </Text>
                <TextInput
                  style={styles.formInput}
                  placeholder={type === 'ADJUSTMENT' ? Math.round(entry.qtyBoxes * packSize).toString() : '0'}
                  placeholderTextColor={colors.text.muted}
                  keyboardType="numeric"
                  value={qtyPieces}
                  onChangeText={handlePiecesChange}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Date (Optional backdating)</Text>
                {Platform.OS === 'web' ? (
                  React.createElement('input', {
                    type: 'date',
                    value: date,
                    onChange: (e: any) => setDate(e.target.value),
                    style: { ...Typography.body, padding: 8, borderRadius: 6, border: '1px solid #ccc' }
                  })
                ) : (
                  <TextInput
                    style={styles.formInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.text.muted}
                    value={date}
                    onChangeText={setDate}
                  />
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Reference</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Audit, Damage, Correction"
                  placeholderTextColor={colors.text.muted}
                  value={reference}
                  onChangeText={setReference}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Reason / Note</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Explanation for stock level change"
                  placeholderTextColor={colors.text.muted}
                  value={note}
                  onChangeText={setNote}
                />
              </View>
            </View>

            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.dialogCancel} onPress={onClose} disabled={loading}>
                <Text style={{ color: colors.text.secondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogSave, loading && { opacity: 0.7 }]} onPress={handleSave} disabled={loading}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{loading ? 'Updating...' : 'Apply'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// 4. Stock Ledger (Transaction Log) Modal Component
function StockLedgerModal({ visible, productInfo, warehouseId, onClose }: { visible: boolean; productInfo: { id: string; name: string; packing?: number; vendorId?: string } | null; warehouseId?: string; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const [ledger, setLedger] = useState<StockLedger[]>([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const loadLedger = useCallback(async () => {
    if (!productInfo) return;
    setLoading(true);
    try {
      const history = await api.getStockLedger(productInfo.id, warehouseId === 'all' ? undefined : warehouseId, productInfo.packing, productInfo.vendorId, startDate, endDate);
      setLedger(history);
    } catch (err) {
      console.error('Error fetching ledger:', err);
    } finally {
      setLoading(false);
    }
  }, [productInfo, warehouseId, startDate, endDate]);

  useEffect(() => {
    if (visible && productInfo) {
      loadLedger();
    }
  }, [visible, productInfo, loadLedger]);

  if (!productInfo) return null;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.ledgerSheet}>
          <View style={styles.dialogHeader}>
            <View>
              <Text style={styles.dialogTitle}>Stock Ledger</Text>
              <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.primary, marginTop: 2 }}>{productInfo.name}</Text>
              {warehouseId && warehouseId !== 'all' ? (
                <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginTop: 1 }}>Godown Filter: Active</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text.muted} />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.primary, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, height: 32 }}>
              <Text style={{ ...Typography.bodySm, color: colors.text.muted, marginRight: 6 }}>From:</Text>
              {Platform.OS === 'web' ? (
                React.createElement('input', {
                  type: 'date',
                  value: startDate,
                  onChange: (e: any) => setStartDate(e.target.value),
                  style: { ...Typography.bodySm, border: 'none', outline: 'none', background: 'transparent', color: colors.text.primary }
                })
              ) : (
                <TextInput
                  style={{ ...Typography.bodySm, color: colors.text.primary, minWidth: 90 }}
                  placeholder="YYYY-MM-DD"
                  value={startDate}
                  onChangeText={setStartDate}
                />
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.primary, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, height: 32 }}>
              <Text style={{ ...Typography.bodySm, color: colors.text.muted, marginRight: 6 }}>To:</Text>
              {Platform.OS === 'web' ? (
                React.createElement('input', {
                  type: 'date',
                  value: endDate,
                  onChange: (e: any) => setEndDate(e.target.value),
                  style: { ...Typography.bodySm, border: 'none', outline: 'none', background: 'transparent', color: colors.text.primary }
                })
              ) : (
                <TextInput
                  style={{ ...Typography.bodySm, color: colors.text.primary, minWidth: 90 }}
                  placeholder="YYYY-MM-DD"
                  value={endDate}
                  onChangeText={setEndDate}
                />
              )}
            </View>
            {(startDate || endDate) && (
              <TouchableOpacity onPress={() => { setStartDate(''); setEndDate(''); }} style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.bg.secondary, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ ...Typography.bodySm, color: colors.text.secondary }}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={{ flex: 1, marginVertical: Spacing.md }} showsVerticalScrollIndicator={true}>
            {loading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: colors.text.muted }}>खाता बही लोड हो रहा है...</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ flexGrow: 1 }}>
                <View style={[styles.ledgerTable, { width: '100%', minWidth: '100%' }]}>
                {/* Headers */}
                <View style={styles.ledgerHeaderRow}>
                  <Text style={[styles.ledgerHeaderCell, { flex: 1.2 }]}>Date &amp; Time</Text>
                  <Text style={[styles.ledgerHeaderCell, { flex: 1.5 }]}>Godown</Text>
                  <Text style={[styles.ledgerHeaderCell, { width: 90 }]}>Tx Type</Text>
                  <Text style={[styles.ledgerHeaderCell, { width: 90, textAlign: 'center' }]}>Packing</Text>
                  <Text style={[styles.ledgerHeaderCell, { width: 100, textAlign: 'right' }]}>Qty Change</Text>
                  <Text style={[styles.ledgerHeaderCell, { width: 100, textAlign: 'right' }]}>Balance</Text>
                  <Text style={[styles.ledgerHeaderCell, { flex: 2.5 }]}>Ref / Note / Mfg Unit</Text>
                  <Text style={[styles.ledgerHeaderCell, { flex: 1 }]}>User</Text>
                </View>

                {/* Rows */}
                {ledger.map((log) => {
                  const txDate = new Date(log.createdAt).toLocaleString('en-IN', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  let badgeBg = colors.bg.secondary;
                  let badgeText = colors.text.muted;
                  if (log.type === 'IN') {
                    badgeBg = colors.success + '15';
                    badgeText = colors.success;
                  } else if (log.type === 'OUT') {
                    badgeBg = colors.danger + '15';
                    badgeText = colors.danger;
                  } else {
                    badgeBg = colors.primary + '15';
                    badgeText = colors.primary;
                  }

                  const qtyChangeStr = log.qtyBoxes > 0 ? `+${log.qtyBoxes}` : `${log.qtyBoxes}`;

                  return (
                    <View key={log._id} style={styles.ledgerBodyRow}>
                      <Text style={[styles.ledgerCell, { ...Typography.caption, flex: 1.2 }]}>{txDate}</Text>
                      <Text style={[styles.ledgerCell, { flex: 1.5 }]} numberOfLines={1}>{log.warehouseName}</Text>
                      <View style={[styles.ledgerCell, { width: 90 }]}>
                        <StatusPill  label={<>{log.type}</>} textStyle={[styles.typeBadgeText, { color: badgeText }]} />
                      </View>
                      <Text style={[styles.ledgerCell, { width: 90, textAlign: 'center', color: colors.text.secondary }]}>
                        {log.packing || 0} Pcs
                      </Text>
                      <Text style={[styles.ledgerCell, { width: 100, textAlign: 'right', fontWeight: '700', color: log.type === 'IN' ? colors.success : log.type === 'OUT' ? colors.danger : colors.text.primary }]}>
                        {formatStock(log.qtyBoxes, log.packing || 1, true, true)}
                      </Text>
                      <Text style={[styles.ledgerCell, { width: 100, textAlign: 'right', fontWeight: '700' }]}>
                        {formatStock(log.balanceBoxes, log.packing || 1, false, true)}
                      </Text>
                      <View style={[styles.ledgerCell, { flex: 2.5 }]}>
                        {log.reference ? <Text style={styles.ledgerRefText}>Ref: {log.reference}</Text> : null}
                        {log.note ? <Text style={styles.ledgerNoteText}>{log.note}</Text> : null}
                        {log.manufacturingUnitName ? (
                          <Text style={{ ...Typography.eyebrow, fontWeight: '700', color: colors.primary, marginTop: 1 }}>
                             {log.manufacturingUnitName}
                          </Text>
                        ) : null}
                        {!log.reference && !log.note && !log.manufacturingUnitName ? <Text style={{ ...Typography.caption, color: colors.text.muted }}>—</Text> : null}
                      </View>
                      <Text style={[styles.ledgerCell, { flex: 1 }]} numberOfLines={1}>{log.createdBy || 'System'}</Text>
                    </View>
                  );
                })}

                {ledger.length === 0 && (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <Ionicons name="clipboard-outline" size={24} color={colors.text.muted} />
                    <Text style={{ ...Typography.bodySm, color: colors.text.muted, marginTop: 6 }}>No ledger actions recorded yet</Text>
                  </View>
                )}
              </View>
              </ScrollView>
            )}
          </ScrollView>

          <View style={styles.dialogActions}>
            <TouchableOpacity style={[styles.dialogCancel, { borderColor: colors.border }]} onPress={onClose}>
              <Text style={{ color: colors.text.secondary }}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// MAIN INVENTORIES SCREEN COMPONENT
export default function InventoriesScreen() {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { user } = useAuth();
  const perm = usePermission();
  const styles = useStyles(createStyles);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const getDisplayName = (item: any) => {
    const p = products.find(prod => prod._id === item.productId);
    if (p && p.name) {
      const sizeStr = (p.size && !p.name.toLowerCase().includes(p.size.toLowerCase())) ? ` (${p.size})` : '';
      return `${p.name}${sizeStr}`;
    }
    const name = item.name || item.itemName;
    if (name) {
      const sizeStr = (item.size && !name.toLowerCase().includes(item.size.toLowerCase())) ? ` (${item.size})` : '';
      return `${name}${sizeStr}`;
    }
    const parts = [
      item.size,
      item.shape,
      item.colour,
      item.weight
    ];
    const combined = parts.filter(Boolean).join(' ');
    return combined || item.productType || 'Unnamed Product';
  };
  const [vendors, setVendors] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('all');
  const [consolidatedItems, setConsolidatedItems] = useState<ConsolidatedInventory[]>([]);
  const [warehouseEntries, setWarehouseEntries] = useState<InventoryEntry[]>([]);
  const [search, setSearch] = useListState('inventory_search', '');
  
  const params = useLocalSearchParams<{ search?: string }>();
  useEffect(() => {
    if (params.search && params.search !== search) {
      setSearch(params.search);
    }
  }, [params.search]);

  const debouncedSearch = useDebouncedValue(search, 300);
  const [activeTab, setActiveTab] = useListState<'stock' | 'transfers' | 'warehouses' | 'ledger' | 'raw_material_ledger' | 'packing_material_ledger' | 'stock_movements'>('inventory_tab', 'stock');
  const [loading, setLoading] = useState(true);
  
  const [page, setPage] = useListState('inventory_page', 1);
  const [refreshing, setRefreshing] = useState(false);

  // Modals Visibility
  const [addWarehouseVisible, setAddWarehouseVisible] = useState(false);
  const [addStockVisible, setAddStockVisible] = useState(false);
  const [addStockInitialProductId, setAddStockInitialProductId] = useState('');
  const [adjustStockVisible, setAdjustStockVisible] = useState(false);
  const [ledgerVisible, setLedgerVisible] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);

  // Selected for modals
  const [selectedEntry, setSelectedEntry] = useState<InventoryEntry | null>(null);
  const [selectedLedgerProduct, setSelectedLedgerProduct] = useState<{ id: string; name: string; packing?: number; vendorId?: string } | null>(null);

  // Selector Dropdowns visibility
  const [showWarehouseFilterDropdown, setShowWarehouseFilterDropdown] = useState(false);
  const [showStockActionsDropdown, setShowStockActionsDropdown] = useState(false);

  // Visual Mode and Filters
  const [selectedVendorId, setSelectedVendorId] = useState('all');
  const [showVendorFilterDropdown, setShowVendorFilterDropdown] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [showZero, setShowZero] = useState(false);
  const [showDeadStock, setShowDeadStock] = useState(false);
  const [deadStockItems, setDeadStockItems] = useState<DeadStockItem[]>([]);
  const [showTransfers, setShowTransfers] = useState(false);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [addTransferVisible, setAddTransferVisible] = useState(false);

  const loadData = useCallback(async () => {
    try {
      // 1. Fetch Warehouses, Products, Vendors, Dead Stock, and Transfers
      const [ws, prods, vends, dead, trs] = await Promise.all([
        api.getWarehouses(),
        api.getProducts(),
        api.getVendors(),
        api.getDeadStock().catch(() => []),
        api.getStockTransfers().catch(() => [])
      ]);
      setWarehouses(ws);
      setProducts(prods);
      setVendors(vends);
      setDeadStockItems(dead);
      setTransfers(trs);

      // 2. Fetch inventory based on selected godown
      if (selectedWarehouseId === 'all') {
        const cons = await api.getConsolidatedInventory(debouncedSearch);
        setConsolidatedItems(cons);
      } else {
        const entries = await api.getInventoryEntries(selectedWarehouseId, debouncedSearch);
        setWarehouseEntries(entries);
      }
    } catch (err) {
      console.error('Error fetching inventories details:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedWarehouseId, debouncedSearch]);

  const loadedOnce = useRef(false);
  useEffect(() => {
    if (!loadedOnce.current) {
      loadedOnce.current = true;
      loadData();
    }
  }, [loadData]);
  useEffect(() => {
    const sub1 = DeviceEventEmitter.addListener('inventory_updated_event', () => loadData());
    const sub2 = DeviceEventEmitter.addListener('mfg_stage_updated_event', () => loadData());
    const sub3 = DeviceEventEmitter.addListener('mfg_batch_created_event', () => loadData());
    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
    };
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    api.clearCache();
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleShipTransfer = (id: string) => {
    confirm({
      title: 'Ship Transfer?',
      description: 'Stock will be deducted from source warehouse.',
      confirmLabel: 'Ship Transfer',
      iconName: 'boat-outline',
      onConfirm: async () => {
        try {
          await api.shipStockTransfer(id);
          showToast('Transfer shipped successfully', 'success');
          loadData();
        } catch (err: any) {
          showToast(err.message || 'Failed to ship transfer', 'error');
        }
      }
    });
  };

  const handleReceiveTransfer = (id: string) => {
    confirm({
      title: 'Receive Transfer?',
      description: 'Stock will be added to target warehouse.',
      confirmLabel: 'Receive Transfer',
      iconName: 'download-outline',
      onConfirm: async () => {
        try {
          await api.receiveStockTransfer(id);
          showToast('Transfer received successfully', 'success');
          loadData();
        } catch (err: any) {
          showToast(err.message || 'Failed to receive transfer', 'error');
        }
      }
    });
  };

  const handleCancelTransfer = (id: string) => {
    confirm({
      title: 'Cancel Transfer?',
      description: 'Pending/Shipped stock will be reverted.',
      destructive: true,
      confirmLabel: 'Cancel Transfer',
      iconName: 'close-circle-outline',
      onConfirm: async () => {
        try {
          await api.cancelStockTransfer(id);
          showToast('Transfer cancelled successfully', 'success');
          loadData();
        } catch (err: any) {
          showToast(err.message || 'Failed to cancel transfer', 'error');
        }
      }
    });
  };

  // Grouping consolidatedItems or warehouseEntries by product specifications (unique by size, shape, colour, weight, productType)
  const processedItems = useMemo(() => {
    // 1. Grouping Consolidated view
    if (selectedWarehouseId === 'all') {
      const map: Record<string, {
        productId: string;
        productType: string;
        size?: string;
        colour: string;
        shape: string;
        weight: string;
        hsnCode: string;
        totalBoxes: number;
        vendorName: string;
        warehouses: { warehouseId: string; warehouseName: string; qtyBoxes: number }[];
        vendorDetails: {
          vendorId: string;
          vendorName: string;
          packing: number;
          qtyBoxes: number;
          warehouses: { warehouseId: string; warehouseName: string; qtyBoxes: number }[];
          batchNo?: string;
          mfgDate?: string;
          expiryDate?: string;
          _id?: string;
          manufacturingUnitName?: string;
        }[];
      }> = {};

      consolidatedItems.forEach(item => {
        if (selectedVendorId !== 'all' && item.vendorId !== selectedVendorId) {
          return;
        }
        const key = item.productId;
        if (!map[key]) {
          map[key] = {
            productId: item.productId,
            productType: item.productType,
            size: item.size,
            colour: item.colour,
            shape: item.shape,
            weight: item.weight,
            hsnCode: item.hsnCode,
            totalBoxes: 0,
            vendorName: '',
            warehouses: [],
            vendorDetails: []
          };
        }
        const g = map[key];
        g.totalBoxes += item.totalBoxes;
        
        // Merge warehouses
        (item.warehouses || []).forEach(w => {
          const existingW = g.warehouses.find(x => x.warehouseId === w.warehouseId);
          if (existingW) {
            existingW.qtyBoxes += w.qtyBoxes;
          } else {
            g.warehouses.push({ ...w });
          }
        });

        // Add vendor details
        g.vendorDetails.push({
          vendorId: item.vendorId,
          vendorName: item.vendorName,
          packing: item.packing,
          qtyBoxes: item.totalBoxes,
          warehouses: item.warehouses,
          batchNo: item.batchNo || '',
          mfgDate: item.mfgDate || '',
          expiryDate: item.expiryDate || ''
        });
      });

      // Merge all products if showZero is true to include items that never had stock
      if (showZero) {
        products.forEach(p => {
          if (!map[p._id]) {
            map[p._id] = {
              productId: p._id,
              productType: p.productType || '',
              size: p.size || '',
              colour: p.colour || '',
              shape: p.shape || '',
              weight: p.weight || '',
              hsnCode: p.hsnCode || '',
              totalBoxes: 0,
              vendorName: '',
              warehouses: [],
              vendorDetails: []
            };
          }
        });
      }

      const consolidatedResult = Object.values(map);
      const filtered = showZero
        ? consolidatedResult.filter(item => (item as any).totalBoxes === 0)
        : consolidatedResult.filter(item => (item as any).totalBoxes > 0);
      return filtered.sort((a, b) => compareSizes(a.size, b.size));
    } 
    
    // 2. Grouping single godown entries
    else {
      const map: Record<string, {
        productId: string;
        productType: string;
        size?: string;
        colour: string;
        shape: string;
        weight: string;
        hsnCode: string;
        totalBoxes: number;
        vendorName: string;
        warehouses: { warehouseId: string; warehouseName: string; qtyBoxes: number }[];
        vendorDetails: {
          vendorId: string;
          vendorName: string;
          packing: number;
          qtyBoxes: number;
          warehouses: { warehouseId: string; warehouseName: string; qtyBoxes: number }[];
          _id: string;
          batchNo?: string;
          mfgDate?: string;
          expiryDate?: string;
          manufacturingUnitName?: string;
        }[];
      }> = {};

      warehouseEntries.forEach(entry => {
        if (selectedVendorId !== 'all' && entry.vendorId !== selectedVendorId) {
          return;
        }
        const key = entry.productId;
        if (!map[key]) {
          map[key] = {
            productId: entry.productId,
            productType: entry.productType,
            size: entry.size,
            colour: entry.colour,
            shape: entry.shape,
            weight: entry.weight,
            hsnCode: entry.hsnCode,
            totalBoxes: 0,
            vendorName: '',
            warehouses: [],
            vendorDetails: []
          };
        }
        const g = map[key];
        g.totalBoxes += entry.qtyBoxes;
        
        const existingW = g.warehouses.find(x => x.warehouseId === entry.warehouseId);
        if (existingW) {
          existingW.qtyBoxes += entry.qtyBoxes;
        } else {
          g.warehouses.push({ warehouseId: entry.warehouseId, warehouseName: entry.warehouseName, qtyBoxes: entry.qtyBoxes });
        }

        g.vendorDetails.push({
          vendorId: entry.vendorId || '',
          vendorName: entry.vendorName,
          packing: entry.packing,
          qtyBoxes: entry.qtyBoxes,
          warehouses: [{ warehouseId: entry.warehouseId, warehouseName: entry.warehouseName, qtyBoxes: entry.qtyBoxes }],
          _id: entry._id,
          batchNo: entry.batchNo || '',
          mfgDate: entry.mfgDate || '',
          expiryDate: entry.expiryDate || '',
          manufacturingUnitName: entry.manufacturingUnitName || ''
        });
      });

      // Merge all products if showZero is true to include items that never had stock
      if (showZero) {
        products.forEach(p => {
          if (!map[p._id]) {
            map[p._id] = {
              productId: p._id,
              productType: p.productType || '',
              size: p.size || '',
              colour: p.colour || '',
              shape: p.shape || '',
              weight: p.weight || '',
              hsnCode: p.hsnCode || '',
              totalBoxes: 0,
              vendorName: '',
              warehouses: [],
              vendorDetails: []
            };
          }
        });
      }

      const result = Object.values(map);
      const filtered = showZero
        ? result.filter(item => (item as any).totalBoxes === 0)
        : result.filter(item => (item as any).totalBoxes > 0);
      return filtered.sort((a, b) => compareSizes(a.size, b.size));
    }
  }, [consolidatedItems, warehouseEntries, selectedWarehouseId, selectedVendorId, showZero, products]);

  // Compute Metrics Summaries
  const totalWarehouses = warehouses.length;
  
  let totalStockPieces = 0;

  if (selectedWarehouseId === 'all') {
    consolidatedItems
      .filter(item => selectedVendorId === 'all' || item.vendorId === selectedVendorId)
      .forEach(item => {
        const packing = item.packing || 1;
        const totalPcs = Math.round(item.totalBoxes * packing);
        totalStockPieces += totalPcs;
      });
  } else {
    warehouseEntries
      .filter(item => selectedVendorId === 'all' || item.vendorId === selectedVendorId)
      .forEach(item => {
        const packing = item.packing || 1;
        const totalPcs = Math.round(item.qtyBoxes * packing);
        totalStockPieces += totalPcs;
      });
  }

  const uniqueItemsCount = processedItems.length;

  const currentWarehouseName = selectedWarehouseId === 'all'
    ? 'All Warehouses'
    : warehouses.find(w => w._id === selectedWarehouseId)?.name || 'Particular Godown';

  const currentVendorName = selectedVendorId === 'all'
    ? 'All Vendors'
    : vendors.find(v => v._id === selectedVendorId)?.displayName || vendors.find(v => v._id === selectedVendorId)?.name || 'Selected Vendor';

  return (
    <View style={styles.screen}>
      <PageHeader
        title="Inventory Management"
        subtitle="Track stock levels, warehouse transfers, and ledgers."
      />
      <View style={styles.innerContainer}>
        {/* Metrics Cards Bar */}
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Warehouses</Text>
            <Text style={styles.summaryValue}>{totalWarehouses}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Active Stock</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.summaryValue, { color: totalStockPieces < 0 ? colors.danger : colors.success }]}>
                {totalStockPieces.toLocaleString('en-IN')} Pcs
              </Text>
            </View>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Unique Items</Text>
            <Text style={styles.summaryValue}>{uniqueItemsCount}</Text>
          </View>
        </View>

                {/* Workspace Navigation Tabs */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: Spacing.lg, backgroundColor: colors.bg.card }}>
          {(['stock', 'transfers', 'warehouses', 'ledger'] as const).map(tab => (
            <TouchableOpacity 
              key={tab}
              style={{ paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: activeTab === tab ? colors.primary : 'transparent' }}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={{ ...Typography.bodySm, fontWeight: activeTab === tab ? '700' : '500', color: activeTab === tab ? colors.primary : colors.text.secondary }}>
                {tab === 'stock' ? 'Stock' : tab === 'transfers' ? 'Transfers' : tab === 'warehouses' ? 'Warehouses' : 'Ledger'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Controls Action & Filter Bar */}
        <View style={{ zIndex: 1100, position: 'relative', marginTop: 12, paddingHorizontal: Spacing.lg }}>
          {(showWarehouseFilterDropdown || showVendorFilterDropdown) && (
            <Pressable
              style={[
                StyleSheet.absoluteFill,
                { 
                  zIndex: 900,
                  ...(Platform.OS === 'web' ? { position: 'fixed' as any } : { position: 'absolute' as any })
                }
              ]}
              onPress={() => {
                setShowWarehouseFilterDropdown(false);
                setShowVendorFilterDropdown(false);
              }}
            />
          )}

          {activeTab === 'stock' && (
            <ListToolbar
              containerStyle={{ paddingHorizontal: 0 }}
              searchPlaceholder="Search items..."
              itemCount={processedItems ? processedItems.length : 0}
              searchValue={search}
              onSearchChange={setSearch}
              renderFilters={() => (
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* View Toggles */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={{
                        paddingHorizontal: 12,
                        height: 40,
                        borderRadius: Radius.md,
                        backgroundColor: (!showZero && !showDeadStock) ? colors.success + '15' : colors.bg.card,
                        borderWidth: 1,
                        borderColor: (!showZero && !showDeadStock) ? colors.success + '40' : colors.border,
                        justifyContent: 'center',
                        alignItems: 'center'
                      }}
                      onPress={() => {
                        setShowZero(false);
                        setShowDeadStock(false);
                      }}
                    >
                      <Text style={{ ...Typography.bodySm, fontWeight: (!showZero && !showDeadStock) ? '700' : '600', color: (!showZero && !showDeadStock) ? colors.success : colors.text.secondary }}>In-Stock</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        paddingHorizontal: 12,
                        height: 40,
                        borderRadius: Radius.md,
                        backgroundColor: showZero ? colors.warning + '15' : colors.bg.card,
                        borderWidth: 1,
                        borderColor: showZero ? colors.warning + '40' : colors.border,
                        justifyContent: 'center',
                        alignItems: 'center'
                      }}
                      onPress={() => {
                        setShowZero(true);
                        setShowDeadStock(false);
                      }}
                    >
                      <Text style={{ ...Typography.bodySm, fontWeight: showZero ? '700' : '600', color: showZero ? colors.warning : colors.text.secondary }}>Zero Stock</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        paddingHorizontal: 12,
                        height: 40,
                        borderRadius: Radius.md,
                        backgroundColor: showDeadStock ? colors.danger + '15' : colors.bg.card,
                        borderWidth: 1,
                        borderColor: showDeadStock ? colors.danger + '40' : colors.border,
                        justifyContent: 'center',
                        alignItems: 'center'
                      }}
                      onPress={() => {
                        setShowDeadStock(true);
                        setShowZero(false);
                      }}
                    >
                      <Text style={{ ...Typography.bodySm, fontWeight: showDeadStock ? '700' : '600', color: showDeadStock ? colors.danger : colors.text.secondary }}>Dead Stock</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Vendor Filter Button */}
                  <View style={{ position: 'relative', zIndex: showVendorFilterDropdown ? 1000 : 1 }}>
                    <TouchableOpacity
                      style={styles.filterDropdownButton}
                      onPress={() => {
                        setShowVendorFilterDropdown(!showVendorFilterDropdown);
                        setShowWarehouseFilterDropdown(false);
                      }}
                    >
                      <Ionicons name="business-outline" size={14} color={colors.success} />
                      <Text style={styles.filterDropdownButtonText}>
                        {currentVendorName}
                      </Text>
                      <Ionicons name={showVendorFilterDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.muted} />
                    </TouchableOpacity>

                    {showVendorFilterDropdown && (
                      <View style={[styles.vendorDropdownPanel, { top: 42, right: 0 }]}>
                        <ScrollView nestedScrollEnabled style={{ maxHeight: 250 }}>
                          <TouchableOpacity
                            style={[styles.filterDropdownItem, selectedVendorId === 'all' && styles.filterDropdownItemActive]}
                            onPress={() => {
                              setSelectedVendorId('all');
                              setShowVendorFilterDropdown(false);
                            }}
                          >
                            <Text style={[styles.filterDropdownItemText, selectedVendorId === 'all' && { fontWeight: '700', color: colors.primary }]}>
                              All Vendors
                            </Text>
                          </TouchableOpacity>

                          {vendors.map(v => (
                            <TouchableOpacity
                              key={v._id}
                              style={[styles.filterDropdownItem, selectedVendorId === v._id && styles.filterDropdownItemActive]}
                              onPress={() => {
                                setSelectedVendorId(v._id);
                                setShowVendorFilterDropdown(false);
                              }}
                            >
                              <Text style={[styles.filterDropdownItemText, selectedVendorId === v._id && { fontWeight: '700', color: colors.primary }]}>
                                {toTitleCase(v.displayName || v.name)}
                              </Text>
                              {v.company ? <Text style={{ ...Typography.eyebrow, color: colors.text.muted }}>{v.company}</Text> : null}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  {/* Warehouse Filter Button */}
                  <View style={{ position: 'relative', zIndex: showWarehouseFilterDropdown ? 1000 : 1 }}>
                    <TouchableOpacity
                      style={styles.filterDropdownButton}
                      onPress={() => {
                        setShowWarehouseFilterDropdown(!showWarehouseFilterDropdown);
                        setShowVendorFilterDropdown(false);
                      }}
                    >
                      <Ionicons name="location" size={14} color={colors.primary} />
                      <Text style={styles.filterDropdownButtonText}>
                        {currentWarehouseName}
                      </Text>
                      <Ionicons name={showWarehouseFilterDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.muted} />
                    </TouchableOpacity>

                    {showWarehouseFilterDropdown && (
                      <View style={[styles.filterDropdownPanel, { top: 42, right: 0 }]}>
                        <ScrollView nestedScrollEnabled style={{ maxHeight: 250 }}>
                          <TouchableOpacity
                            style={[styles.filterDropdownItem, selectedWarehouseId === 'all' && styles.filterDropdownItemActive]}
                            onPress={() => {
                              setSelectedWarehouseId('all');
                              setShowWarehouseFilterDropdown(false);
                            }}
                          >
                            <Text style={[styles.filterDropdownItemText, selectedWarehouseId === 'all' && { fontWeight: '700', color: colors.primary }]}>
                              All Warehouses (Consolidated)
                            </Text>
                          </TouchableOpacity>

                          {warehouses.map(w => (
                            <View key={w._id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <TouchableOpacity
                                style={[styles.filterDropdownItem, { flex: 1, borderBottomWidth: 0 }, selectedWarehouseId === w._id && styles.filterDropdownItemActive]}
                                onPress={() => {
                                  setSelectedWarehouseId(w._id);
                                  setShowWarehouseFilterDropdown(false);
                                }}
                              >
                                <Text style={[styles.filterDropdownItemText, selectedWarehouseId === w._id && { fontWeight: '700', color: colors.primary }]}>
                                  {w.name}
                                </Text>
                                <Text style={{ ...Typography.eyebrow, color: colors.text.muted }}>{w.city}, {w.state}</Text>
                              </TouchableOpacity>
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                </View>
              )}
              {...(perm.can('inventory:edit') ? {
                primaryAction: {
                  label: 'Add Stock',
                  icon: 'add-circle' as any,
                  onPress: () => {
                    setAddStockInitialProductId('');
                    setAddStockVisible(true);
                  }
                }
              } : {})}
            />
          )}

          {activeTab === 'transfers' && (
            <View style={[styles.controlsBar, { justifyContent: 'space-between', paddingHorizontal: 0 }]}>
              <View style={{ flex: 1 }} />
              {perm.can('inventory:edit') && (
                <TouchableOpacity
                  style={[styles.btnCenter, { height: 40, marginTop: 0 }]}
                  onPress={() => setAddTransferVisible(true)}
                >
                  <Ionicons name="add-circle" size={16} color="#fff" />
                  <Text style={{ ...Typography.bodySm, color: '#fff', fontWeight: '700' }}>Request Transfer</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          
          {activeTab === 'warehouses' && (
            <View style={[styles.controlsBar, { justifyContent: 'space-between', paddingHorizontal: 0 }]}>
              <View style={{ flex: 1 }} />
              {perm.can('inventory:edit') && (
                <TouchableOpacity
                  style={[styles.btnCenter, { height: 40, marginTop: 0 }]}
                  onPress={() => {
                    setEditingWarehouse(null);
                    setAddWarehouseVisible(true);
                  }}
                >
                  <Ionicons name="add-circle" size={16} color="#fff" />
                  <Text style={{ ...Typography.bodySm, color: '#fff', fontWeight: '700' }}>Add Warehouse</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {activeTab === 'ledger' && (
            <View style={[styles.controlsBar, { justifyContent: 'space-between', paddingHorizontal: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...Typography.bodySm, color: colors.text.muted }}>Click Ledger button on any stock item to view its history here.</Text>
              </View>
            </View>
          )}
        </View>

        {/* Inventory List / Table */}
        <View style={{ flex: 1, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg }}>
          {activeTab === 'transfers' ? (
            // --- STOCK TRANSFERS VIEW ---
            <View style={{ flex: 1, marginTop: Spacing.md }}>
              <DataTable 
                data={transfers} 
                keyExtractor={(item: any, index: number) => item._id || String(index)} 
                minWidth={900} 
                isRefreshing={refreshing}
                isLoading={loading}
                onRefresh={onRefresh}
                columns={[
                  {
                    key: 'transferNo',
                    title: 'Transfer No',
                    flex: 1.2,
                    render: (item: any) => (
                      <View>
                        <Text style={[styles.tableCell, { fontWeight: '700' }]}>{item.transferNo}</Text>
                        <Text style={{ ...Typography.eyebrow, color: colors.text.muted }}>
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-IN') : ''}
                        </Text>
                      </View>
                    )
                  },
                  {
                    key: 'warehouses',
                    title: 'From  To',
                    flex: 1.5,
                    render: (item: any) => (
                      <View>
                        <Text style={[styles.tableCell, { ...Typography.caption, fontWeight: '700' }]}>{item.fromWarehouseName}</Text>
                        <Text style={{ ...Typography.eyebrow, color: colors.text.muted }}> {item.toWarehouseName}</Text>
                      </View>
                    )
                  },
                  {
                    key: 'items',
                    title: 'Items',
                    flex: 2.0,
                    render: (item: any) => (
                      <View>
                        {(item.items || []).map((it: any, i: number) => (
                          <Text key={i} style={{ ...Typography.eyebrow, color: colors.text.primary }} numberOfLines={1}>
                            • {it.productName} ({it.qtyBoxes} Box{it.qtyBoxes !== 1 ? 'es' : ''})
                          </Text>
                        ))}
                      </View>
                    )
                  },
                  {
                    key: 'status',
                    title: 'Status',
                    flex: 1.0,
                    render: (item: any) => (
                      <StatusPill  label={<>
                          {item.status.toUpperCase()}
                        </>} tone={getStatusTone(item.status)} />
                    )
                  },
                  {
                    key: 'actions',
                    title: 'Actions',
                    flex: 1.8,
                    align: 'right',
                    render: (item: any) => (
                      <View style={[styles.actionsCell, { justifyContent: 'flex-end', width: '100%' }]}>
                        {item.status === 'pending' && perm.can('inventory:edit') && (
                          <TouchableOpacity
                            style={[styles.btnSmall, { backgroundColor: colors.primary }]}
                            onPress={() => handleShipTransfer(item._id)}
                          >
                            <Text style={{ ...Typography.eyebrow, color: '#fff', fontWeight: '700' }}>Ship</Text>
                          </TouchableOpacity>
                        )}
                        {item.status === 'in_transit' && perm.can('inventory:edit') && (
                          <TouchableOpacity
                            style={[styles.btnSmall, { backgroundColor: colors.success }]}
                            onPress={() => handleReceiveTransfer(item._id)}
                          >
                            <Text style={{ ...Typography.eyebrow, color: '#fff', fontWeight: '700' }}>Receive</Text>
                          </TouchableOpacity>
                        )}
                        {(item.status === 'in_transit' || item.status === 'completed') && Platform.OS === 'web' && (
                          <TouchableOpacity
                            style={[styles.btnSmall, { backgroundColor: colors.text.muted }]}
                            onPress={() => {
                              const printTransferChallan = (t: any) => {
                                const dateStr = t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
                                const itemRows = (t.items || []).map((it: any, i: number) => `
                                  <tr>
                                    <td style="border:1px solid #000;padding:6px;text-align:center;">${i + 1}</td>
                                    <td style="border:1px solid #000;padding:6px;">${it.productName}</td>
                                    <td style="border:1px solid #000;padding:6px;text-align:center;font-weight:bold;">${it.batchNo || '—'}</td>
                                    <td style="border:1px solid #000;padding:6px;text-align:center;">${it.qtyBoxes * it.packing} Pcs</td>
                                  </tr>`).join('');

                                const html = `<!DOCTYPE html>
                              <html lang="en">
                              <head>
                                <meta charset="UTF-8"/>
                                <title>Inter-Warehouse Delivery Challan ${t.transferNo}</title>
                                <style>
                                  * { box-sizing: border-box; margin: 0; padding: 0; }
                                  body { font-family: Arial, sans-serif; color: #000; background: #fff; }
                                  .page { width: 210mm; padding: 8mm; }
                                  table { border-collapse: collapse; width: 100%; }
                                  @media print { @page { size: A4 portrait; margin: 0; } .page { page-break-after: always; padding: 8mm; } }
                                </style>
                              </head>
                              <body>
                                <div class="page">
                                  <div style="text-align:center;border:2px solid #000;padding:8px;margin-bottom:6px;">
                                    <div style="font-weight:bold;font-size:18px;">SHEKHAR BANDHU AUSHADHALAYA</div>
                                    <div style="font-size:13px;font-weight:bold;margin-top:4px;letter-spacing:1px;">
                                      DELIVERY CHALLAN — STOCK TRANSFER
                                    </div>
                                    <div style="font-size:9px;color:#555;">(CGST Rule 55 — Inter-Warehouse Stock Transfer)</div>
                                  </div>
                                  <table style="margin-bottom:6px;font-size:10px;border:1px solid #000;">
                                    <tr>
                                      <td style="width:50%;padding:4px;border-right:1px solid #000;">
                                        <strong>Challan No.:</strong> ${t.transferNo}<br/>
                                        <strong>Date:</strong> ${dateStr}<br/>
                                        <strong>From Warehouse:</strong> ${t.fromWarehouseName}
                                      </td>
                                      <td style="width:50%;padding:4px;">
                                        <strong>To Warehouse:</strong> ${t.toWarehouseName}<br/>
                                        <strong>Status:</strong> ${t.status.toUpperCase()}
                                      </td>
                                    </tr>
                                  </table>
                                  <table style="font-size:10px;margin-top:6px;width:100%;border:1px solid #000;border-collapse:collapse;">
                                    <thead>
                                      <tr style="background:#f3f4f6;">
                                        <th style="border:1px solid #000;padding:6px;width:8%;">S.No.</th>
                                        <th style="border:1px solid #000;padding:6px;">Description of Goods</th>
                                        <th style="border:1px solid #000;padding:6px;width:20%;">Batch No.</th>
                                        <th style="border:1px solid #000;padding:6px;width:20%;">Quantity (Pcs)</th>
                                      </tr>
                                    </thead>
                                    <tbody>${itemRows}</tbody>
                                  </table>
                                  ${t.notes ? `<div style="margin-top:8px;font-size:10px;"><strong>Notes:</strong> ${t.notes}</div>` : ''}
                                  <div style="margin-top:48px;display:flex;justify-content:space-between;align-items:center;font-size:10px;">
                                    <div>Authorized Signatory (Source)</div>
                                    <div>Receiver Signatory (Destination)</div>
                                  </div>
                                </div>
                                <script>window.print();</script>
                              </body>
                              </html>`;

                                const win = window.open('', '_blank', 'width=800,height=900');
                                if (win) { win.document.write(html); win.document.close(); }
                              };
                              printTransferChallan(item);
                            }}
                          >
                            <Text style={{ ...Typography.eyebrow, color: '#fff', fontWeight: '700' }}>Print Challan</Text>
                          </TouchableOpacity>
                        )}
                        {['pending', 'in_transit'].includes(item.status) && perm.can('inventory:edit') && (
                          <TouchableOpacity
                            style={[styles.btnSmall, { backgroundColor: colors.danger }]}
                            onPress={() => handleCancelTransfer(item._id)}
                          >
                            <Text style={{ ...Typography.eyebrow, color: '#fff', fontWeight: '700' }}>Cancel</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )
                  }
                ]}
                renderMobileCard={(item: any) => (
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.tableCell, { fontWeight: '700', paddingLeft: 0 }]}>{item.transferNo}</Text>
                        <Text style={{ ...Typography.eyebrow, color: colors.text.muted }}>
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-IN') : ''}
                        </Text>
                      </View>
                      <StatusPill  label={<>{item.status.toUpperCase()}</>} tone={getStatusTone(item.status)} />
                    </View>
                    <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderRadius: Radius.sm, gap: 4 }}>
                      <Text style={[styles.tableCell, { ...Typography.caption, fontWeight: '700', paddingLeft: 0 }]}>{item.fromWarehouseName} → {item.toWarehouseName}</Text>
                      <View>
                        {(item.items || []).map((it: any, i: number) => (
                          <Text key={i} style={{ ...Typography.eyebrow, color: colors.text.primary }} numberOfLines={1}>
                            • {it.productName} ({it.qtyBoxes} Box{it.qtyBoxes !== 1 ? 'es' : ''})
                          </Text>
                        ))}
                      </View>
                    </View>
                    {['pending', 'in_transit'].includes(item.status) && perm.can('inventory:edit') && (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, justifyContent: 'flex-end' }}>
                        {item.status === 'pending' && (
                          <TouchableOpacity
                            style={[styles.btnSmall, { backgroundColor: colors.primary }]}
                            onPress={() => handleShipTransfer(item._id)}
                          >
                            <Text style={{ ...Typography.eyebrow, color: '#fff', fontWeight: '700' }}>Dispatch</Text>
                          </TouchableOpacity>
                        )}
                        {item.status === 'in_transit' && (
                          <TouchableOpacity
                            style={[styles.btnSmall, { backgroundColor: colors.success }]}
                            onPress={() => handleReceiveTransfer(item._id)}
                          >
                            <Text style={{ ...Typography.eyebrow, color: '#fff', fontWeight: '700' }}>Receive</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[styles.btnSmall, { backgroundColor: colors.danger }]}
                          onPress={() => handleCancelTransfer(item._id)}
                        >
                          <Text style={{ ...Typography.eyebrow, color: '#fff', fontWeight: '700' }}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              />

                  {transfers.length === 0 && (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                      <Ionicons name="swap-horizontal-outline" size={36} color={colors.text.muted} />
                      <Text style={{ ...Typography.bodySm, marginTop: 8, color: colors.text.muted }}>No warehouse stock transfers found.</Text>
                    </View>
                  )}

                  {perm.can('inventory:edit') && (
                    <TouchableOpacity
                      style={[styles.btnCenter, { marginTop: 16 }]}
                      onPress={() => setAddTransferVisible(true)}
                    >
                      <Ionicons name="add-circle" size={16} color="#fff" />
                      <Text style={{ ...Typography.bodySm, color: '#fff', fontWeight: '700' }}>Request Stock Transfer</Text>
                    </TouchableOpacity>
                  )}
            </View>
          ) : activeTab === 'stock' && showDeadStock ? (
            // --- DEAD STOCK REPORT VIEW ---
            <View style={{ flex: 1, marginTop: Spacing.md }}>
              <DataTable 
                data={deadStockItems} 
                keyExtractor={(item: any, index: number) => String(index)} 
                minWidth={900} 
                isRefreshing={refreshing}
                isLoading={loading}
                onRefresh={onRefresh}
                columns={[
                  {
                    key: 'product',
                    title: 'Product',
                    flex: 2.5,
                    render: (item: any) => (
                      <View>
                        <Text style={[styles.tableCell, { fontWeight: '700' }]}>{item.productName}</Text>
                        <Text style={{ ...Typography.eyebrow, color: colors.text.muted }}>SKU: {item.productSku} · Size: {item.size}</Text>
                      </View>
                    )
                  },
                  {
                    key: 'warehouse',
                    title: 'Warehouse',
                    flex: 1.8,
                    render: (item: any) => (
                      <Text style={styles.tableCell}>{item.warehouseName}</Text>
                    )
                  },
                  {
                    key: 'qty',
                    title: 'Qty (Boxes)',
                    flex: 1.2,
                    align: 'right',
                    render: (item: any) => (
                      <Text style={[styles.tableCell, { fontWeight: '700' }]}>{item.qtyBoxes}</Text>
                    )
                  },
                  {
                    key: 'stockValue',
                    title: 'Stock Value (₹)',
                    flex: 1.5,
                    align: 'right',
                    render: (item: any) => (
                      <Text style={[styles.tableCell, { color: colors.success, fontWeight: '700' }]}>₹{item.stockValue.toLocaleString('en-IN')}</Text>
                    )
                  },
                  {
                    key: 'inactiveDays',
                    title: 'Inactive Days',
                    flex: 1.2,
                    align: 'right',
                    render: (item: any) => (
                      <Text style={[styles.tableCell, { color: colors.danger, fontWeight: '700' }]}>{item.daysSinceMovement} Days</Text>
                    )
                  }
                ]}
              />

                  {deadStockItems.length === 0 ? (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                      <Ionicons name="checkmark-circle-outline" size={36} color={colors.success} />
                      <Text style={{ ...Typography.bodySm, marginTop: 8, color: colors.text.muted }}>All products have active stock movement!</Text>
                    </View>
                  ) : (
                    <View style={[styles.tableBodyRow, { backgroundColor: colors.danger + '0d', borderTopWidth: 2, borderTopColor: colors.danger }]}>
                      <View style={[styles.tableCellContainer, { flex: 2.5 }]}>
                        <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.danger }}>Total dead stock</Text>
                      </View>
                      <View style={[styles.tableCellContainer, { flex: 1.8 }]} />
                      <View style={[styles.tableCellContainer, { flex: 1.2 }]}>
                        <Text style={[styles.tableCell, { textAlign: 'right', fontWeight: '800', color: colors.danger }]}>
                          {deadStockItems.reduce((s, a) => s + a.qtyBoxes, 0)}
                        </Text>
                      </View>
                      <View style={[styles.tableCellContainer, { flex: 1.5 }]}>
                        <Text style={[styles.tableCell, { textAlign: 'right', fontWeight: '800', color: colors.danger }]}>
                          ₹{deadStockItems.reduce((s, a) => s + a.stockValue, 0).toLocaleString('en-IN')}
                        </Text>
                      </View>
                      <View style={[styles.tableCellContainer, { flex: 1.2, borderRightWidth: 0 }]} />
                    </View>
                  )}
            </View>
          ) : activeTab === 'stock' && selectedWarehouseId === 'all' ? (
            // --- CONSOLIDATED VIEW TABLE ---
            <View style={{ flex: 1, marginTop: Spacing.md }}>
              <DataTable 
                data={processedItems} 
                columns={[]} 
                keyExtractor={(item: any) => item.productId} 
                minWidth={900} 
                isRefreshing={refreshing}
                isLoading={loading}
                onRefresh={onRefresh}
                renderTableHeader={() => (
                  <View style={styles.tableHeaderRow}>
                    <View style={[styles.tableHeaderCellContainer, { width: 40 }]}><Text style={styles.tableHeaderCell}> </Text></View>
                    <View style={[styles.tableHeaderCellContainer, { flex: 2.5 }]}><Text style={styles.tableHeaderCell}>Item Name</Text></View>
                    <View style={[styles.tableHeaderCellContainer, { flex: 1.8 }]}><Text style={styles.tableHeaderCell}>Vendors</Text></View>
                    <View style={[styles.tableHeaderCellContainer, { flex: 2.2 }]}><Text style={styles.tableHeaderCell}>Godowns</Text></View>
                    <View style={[styles.tableHeaderCellContainer, { flex: 1.2, borderRightWidth: 0 }]}><Text style={styles.tableHeaderCell}>Total Stock</Text></View>
                  </View>
                )}
                renderMobileCard={(item: any) => (
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.primary, flex: 1 }} numberOfLines={1}>
                        {getDisplayName(item)}
                      </Text>
                      <StockDisplay qtyBoxes={item.totalBoxes} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ ...Typography.caption, color: colors.text.muted }}>
                        {item.productType} • {formatVendorDisplay(item.vendorName)}
                      </Text>
                      <Text style={{ ...Typography.caption, color: colors.text.muted }}>
                        {item.warehouses.length} Godown(s)
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                       {perm.can('inventory:edit') && (
                         <TouchableOpacity onPress={() => { setAddStockInitialProductId(item.productId); setAddStockVisible(true); }} style={{ backgroundColor: colors.primary+'10', padding: 6, borderRadius: Radius.sm }}>
                           <Text style={{ ...Typography.eyebrow, color: colors.primary, fontWeight: '700' }}>+ Add Stock</Text>
                         </TouchableOpacity>
                       )}
                       {perm.can('inventory:viewValue') && (
                         <TouchableOpacity onPress={() => { setSelectedLedgerProduct({ id: item.productId, name: getDisplayName(item) }); setLedgerVisible(true); }} style={{ backgroundColor: colors.bg.secondary, padding: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border }}>
                           <Text style={{ ...Typography.eyebrow, color: colors.text.secondary, fontWeight: '700' }}>Ledger</Text>
                         </TouchableOpacity>
                       )}
                    </View>
                  </View>
                )}
                renderTableRow={(item: any) => (
                  <InventoryRow
                    key={item.productId}
                    item={item}
                    isExpanded={!!expandedProducts[item.productId]}
                    onToggleExpand={() => setExpandedProducts(prev => ({ ...prev, [item.productId]: !prev[item.productId] }))}
                    isConsolidated={true}
                    products={products}
                    colors={colors}
                    styles={styles}
                    perm={perm}
                    onAddStock={(id: string) => { setAddStockInitialProductId(id); setAddStockVisible(true); }}
                    onAdjustStock={(vd: any) => { setSelectedEntry(vd); setAdjustStockVisible(true); }}
                    onShowLedger={(prodInfo: any) => { setSelectedLedgerProduct(prodInfo); setLedgerVisible(true); }}
                    formatVendorDisplay={formatVendorDisplay}
                    getDisplayName={getDisplayName}
                    currentWarehouseName={currentWarehouseName}
                  />
                )}
              />
            </View>
          ) : (
            // --- SINGLE GODOWN FILTERED TABLE ---
            <View style={{ flex: 1, marginTop: Spacing.md }}>
              <DataTable 
                data={processedItems} 
                columns={[]} 
                keyExtractor={(item: any) => item.productId} 
                minWidth={900} 
                isRefreshing={refreshing}
                isLoading={loading}
                onRefresh={onRefresh}
                renderTableHeader={() => (
                  <View style={styles.tableHeaderRow}>
                    <View style={[styles.tableHeaderCellContainer, { width: 40 }]}><Text style={styles.tableHeaderCell}> </Text></View>
                    <View style={[styles.tableHeaderCellContainer, { flex: 2.5 }]}><Text style={styles.tableHeaderCell}>Item Name</Text></View>
                    <View style={[styles.tableHeaderCellContainer, { flex: 1.8 }]}><Text style={styles.tableHeaderCell}>Vendors</Text></View>
                    <View style={[styles.tableHeaderCellContainer, { flex: 2.2 }]}><Text style={styles.tableHeaderCell}>Godowns</Text></View>
                    <View style={[styles.tableHeaderCellContainer, { flex: 1.2, borderRightWidth: 0 }]}><Text style={styles.tableHeaderCell}>Total Stock</Text></View>
                  </View>
                )}
                renderMobileCard={(item: any) => (
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.primary, flex: 1 }} numberOfLines={1}>
                        {getDisplayName(item)}
                      </Text>
                      <StockDisplay qtyBoxes={item.totalBoxes} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ ...Typography.caption, color: colors.text.muted }}>
                        {item.productType} • {formatVendorDisplay(item.vendorName)}
                      </Text>
                      <Text style={{ ...Typography.caption, color: colors.text.muted }}>
                        {item.warehouses.length} Godown(s)
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                       {perm.can('inventory:edit') && (
                         <TouchableOpacity onPress={() => { setAddStockInitialProductId(item.productId); setAddStockVisible(true); }} style={{ backgroundColor: colors.primary+'10', padding: 6, borderRadius: Radius.sm }}>
                           <Text style={{ ...Typography.eyebrow, color: colors.primary, fontWeight: '700' }}>+ Add Stock</Text>
                         </TouchableOpacity>
                       )}
                       {perm.can('inventory:viewValue') && (
                         <TouchableOpacity onPress={() => { setSelectedLedgerProduct({ id: item.productId, name: getDisplayName(item) }); setLedgerVisible(true); }} style={{ backgroundColor: colors.bg.secondary, padding: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border }}>
                           <Text style={{ ...Typography.eyebrow, color: colors.text.secondary, fontWeight: '700' }}>Ledger</Text>
                         </TouchableOpacity>
                       )}
                    </View>
                  </View>
                )}
                renderTableRow={(item: any) => (
                    <InventoryRow
                      key={item.productId}
                      item={item}
                      isExpanded={!!expandedProducts[item.productId]}
                      onToggleExpand={() => setExpandedProducts(prev => ({ ...prev, [item.productId]: !prev[item.productId] }))}
                      isConsolidated={false}
                      products={products}
                      colors={colors}
                      styles={styles}
                      perm={perm}
                      onAddStock={(id: string) => { setAddStockInitialProductId(id); setAddStockVisible(true); }}
                      onAdjustStock={(vd: any) => { setSelectedEntry(vd); setAdjustStockVisible(true); }}
                      onShowLedger={(prodInfo: any) => { setSelectedLedgerProduct(prodInfo); setLedgerVisible(true); }}
                      formatVendorDisplay={formatVendorDisplay}
                      getDisplayName={getDisplayName}
                      currentWarehouseName={currentWarehouseName}
                    />
                )}
              />
            </View>
          )}
                  {activeTab === 'warehouses' && (
            <View style={{ flex: 1, marginTop: Spacing.md }}>
              <DataTable 
                data={warehouses} 
                keyExtractor={(item) => item._id} 
                minWidth={600} 
                isRefreshing={refreshing}
                isLoading={loading}
                onRefresh={onRefresh}
                columns={[
                  {
                    key: 'name',
                    title: 'Warehouse Name',
                    flex: 2,
                    render: (item: any) => (
                      <View>
                        <Text style={[styles.tableCell, { fontWeight: '700' }]}>{item.name}</Text>
                        <Text style={{ ...Typography.eyebrow, color: colors.text.muted }}>{item.city}, {item.state}</Text>
                      </View>
                    )
                  },
                  {
                    key: 'address',
                    title: 'Address',
                    flex: 3,
                    render: (item: any) => (
                      <Text style={styles.tableCell} numberOfLines={2}>
                        {item.addressLine1} {item.addressLine2}
                      </Text>
                    )
                  },
                  {
                    key: 'contact',
                    title: 'Contact Person',
                    flex: 2,
                    render: (item: any) => (
                      <View>
                        <Text style={styles.tableCell}>{item.contactPerson || '-'}</Text>
                        {item.phone ? <Text style={{ ...Typography.eyebrow, color: colors.text.muted }}>{item.phone}</Text> : null}
                      </View>
                    )
                  },
                  {
                    key: 'actions',
                    title: '',
                    width: 80,
                    align: 'right',
                    render: (item: any) => (
                      perm.can('inventory:viewValue') ? (
                        <TouchableOpacity
                          style={{ padding: 8 }}
                          onPress={() => {
                            setEditingWarehouse(item);
                            setAddWarehouseVisible(true);
                          }}
                        >
                          <Ionicons name="pencil" size={16} color={colors.primary} />
                        </TouchableOpacity>
                      ) : null
                    )
                  }
                ]}
                renderMobileCard={(item: any) => (
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.primary }}>{item.name}</Text>
                      {perm.can('inventory:viewValue') && (
                        <TouchableOpacity onPress={() => { setEditingWarehouse(item); setAddWarehouseVisible(true); }}>
                          <Ionicons name="pencil" size={16} color={colors.primary} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={{ ...Typography.caption, color: colors.text.secondary }}>{item.city}, {item.state}</Text>
                  </View>
                )}
              />
            </View>
          )}
          {activeTab === 'ledger' && (
            <View style={{ flex: 1, marginTop: Spacing.md, backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.xl, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="list" size={48} color={colors.text.muted} />
              <Text style={{ ...Typography.h3, color: colors.text.primary, marginTop: Spacing.md }}>Stock Ledger</Text>
              <Text style={{ ...Typography.bodySm, color: colors.text.secondary, marginTop: Spacing.sm, textAlign: 'center', maxWidth: 400 }}>
                To view the ledger for a specific item, go to the Stock tab and click the "Ledger" button next to it.
              </Text>
              <TouchableOpacity
                style={[styles.btnCenter, { marginTop: Spacing.lg }]}
                onPress={() => setActiveTab('stock')}
              >
                <Text style={{ ...Typography.bodySm, color: '#fff', fontWeight: '700' }}>Go to Stock Tab</Text>
              </TouchableOpacity>
            </View>
          )}
</View>
      </View>

      {/* MODAL WRAPPERS */}
      <AddWarehouseModal
        visible={addWarehouseVisible}
        onClose={() => { setAddWarehouseVisible(false); setEditingWarehouse(null); }}
        onSaved={loadData}
        warehouse={editingWarehouse}
      />

      <AddStockModal
        visible={addStockVisible}
        initialProductId={addStockInitialProductId}
        onClose={() => setAddStockVisible(false)}
        onSaved={loadData}
        warehouses={warehouses}
        products={products}
        vendors={vendors}
      />

      <AdjustStockModal
        visible={adjustStockVisible}
        entry={selectedEntry}
        onClose={() => { setSelectedEntry(null); setAdjustStockVisible(false); }}
        onSaved={loadData}
        products={products}
      />

      <StockLedgerModal
        visible={ledgerVisible}
        productInfo={selectedLedgerProduct}
        warehouseId={selectedWarehouseId}
        onClose={() => { setSelectedLedgerProduct(null); setLedgerVisible(false); loadData(); }}
      />

      <AddTransferModal
        visible={addTransferVisible}
        onClose={() => setAddTransferVisible(false)}
        onSaved={loadData}
        warehouses={warehouses}
        products={products}
      />
    </View>
  );
}

// ── Add Transfer Modal Component ──
function AddTransferModal({ visible, onClose, onSaved, warehouses, products }: { visible: boolean; onClose: () => void; onSaved: () => void; warehouses: Warehouse[]; products: Product[] }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [items, setItems] = useState<{ productId: string; qtyBoxes: string; packing: string; batchNo: string }[]>([{ productId: '', qtyBoxes: '1', packing: '1', batchNo: '' }]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setFromWarehouseId(warehouses[0]?._id || '');
      setToWarehouseId(warehouses[1]?._id || '');
      setItems([{ productId: '', qtyBoxes: '1', packing: '1', batchNo: '' }]);
      setNotes('');
      setError('');
    }
  }, [visible, warehouses]);

  const handleSave = async () => {
    if (!fromWarehouseId || !toWarehouseId) {
      setError('Both source and destination warehouses are required.');
      return;
    }
    if (fromWarehouseId === toWarehouseId) {
      setError('Source and Destination warehouse cannot be the same.');
      return;
    }
    if (items.some(it => !it.productId)) {
      setError('All transfer lines must specify a product.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api.createStockTransfer({
        fromWarehouseId,
        toWarehouseId,
        items: items.map(it => {
          const match = products.find(p => p._id === it.productId);
          return {
            productId: it.productId,
            productName: match ? match.name : 'Unknown Product',
            qtyBoxes: parseFloat(it.qtyBoxes) || 0,
            packing: parseInt(it.packing, 10) || 1,
            batchNo: it.batchNo.trim()
          };
        }),
        notes
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to initiate transfer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.dialogSheet, { maxWidth: 600 }]}>
          <Pressable style={styles.dialogContainer}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Initiate Inter-Warehouse Transfer</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={colors.text.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, marginVertical: Spacing.sm }} keyboardShouldPersistTaps="handled">
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.formLabel}>From Warehouse (Source) *</Text>
                  {Platform.OS === 'web' ? (
                    <select
                      value={fromWarehouseId}
                      onChange={(e: any) => setFromWarehouseId(e.target.value)}
                      style={{ ...Typography.bodySm, padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, backgroundColor: colors.bg.primary, color: colors.text.primary, width: '100%' }}
                    >
                      {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                    </select>
                  ) : (
                    <TextInput style={styles.formInput} value={fromWarehouseId} onChangeText={setFromWarehouseId} />
                  )}
                </View>

                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.formLabel}>To Warehouse (Destination) *</Text>
                  {Platform.OS === 'web' ? (
                    <select
                      value={toWarehouseId}
                      onChange={(e: any) => setToWarehouseId(e.target.value)}
                      style={{ ...Typography.bodySm, padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, backgroundColor: colors.bg.primary, color: colors.text.primary, width: '100%' }}
                    >
                      {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                    </select>
                  ) : (
                    <TextInput style={styles.formInput} value={toWarehouseId} onChangeText={setToWarehouseId} />
                  )}
                </View>
              </View>

              <Text style={[styles.formLabel, { marginTop: 8 }]}>Transfer Items *</Text>
              {items.map((item, idx) => (
                <View key={idx} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ flex: 2 }}>
                    {Platform.OS === 'web' ? (
                      <select
                        value={item.productId}
                        onChange={(e: any) => {
                          const next = [...items];
                          next[idx].productId = e.target.value;
                          setItems(next);
                        }}
                        style={{ ...Typography.bodySm, padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, backgroundColor: colors.bg.primary, color: colors.text.primary, width: '100%' }}
                      >
                        <option value="">Select Product</option>
                        {products.map(p => <option key={p._id} value={p._id}>{p.name} ({p.size})</option>)}
                      </select>
                    ) : (
                      <TextInput style={styles.formInput} value={item.productId} placeholder="ProductID" />
                    )}
                  </View>
                  <TextInput
                    style={[styles.formInput, { flex: 1 }]}
                    placeholder="Qty"
                    keyboardType="numeric"
                    value={item.qtyBoxes}
                    onChangeText={(val) => {
                      const next = [...items];
                      next[idx].qtyBoxes = val;
                      setItems(next);
                    }}
                  />
                  <TextInput
                    style={[styles.formInput, { flex: 1.2 }]}
                    placeholder="Batch No"
                    value={item.batchNo}
                    onChangeText={(val) => {
                      const next = [...items];
                      next[idx].batchNo = val;
                      setItems(next);
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      if (items.length === 1) return;
                      setItems(items.filter((_, i) => i !== idx));
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 12 }}
                onPress={() => setItems([...items, { productId: '', qtyBoxes: '1', packing: '1', batchNo: '' }])}
              >
                <Ionicons name="add-circle" size={16} color={colors.primary} />
                <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.primary }}>Add Line Item</Text>
              </TouchableOpacity>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Notes</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Additional transfer notes..."
                  placeholderTextColor={colors.text.muted}
                  value={notes}
                  onChangeText={setNotes}
                />
              </View>
            </ScrollView>

            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.dialogCancel} onPress={onClose} disabled={loading}>
                <Text style={{ color: colors.text.secondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogSave, loading && { opacity: 0.7 }]} onPress={handleSave} disabled={loading}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{loading ? 'Submitting...' : 'Initiate'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ── Memoized Inventory Row Component for Performance ──
const InventoryRow = React.memo(({ item, isExpanded, onToggleExpand, isConsolidated, products, colors, styles, perm, onAddStock, onAdjustStock, onShowLedger, formatVendorDisplay, getDisplayName, currentWarehouseName }: any) => {
  const { width } = useWindowDimensions();
  const uniqueVendors = Array.from(new Set(item.vendorDetails.map((v: any) => v.vendorName))) as string[];
  const prodMatch = products.find((p: any) => p._id === item.productId);
  const minReorderVal = prodMatch ? (prodMatch.minReorder || 0) : 0;
  const isLowStock = minReorderVal > 0 ? item.totalBoxes <= minReorderVal : item.totalBoxes <= 0;

  if (width < 768) {
    return (
      <View style={[styles.expandableGroupContainer, { marginHorizontal: Spacing.md, marginTop: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }]}>
        <Pressable
          style={({ pressed }) => [
            { padding: Spacing.md, backgroundColor: isLowStock ? colors.warning + '12' : (pressed ? colors.bg.secondary : colors.bg.card) }
          ]}
          onPress={onToggleExpand}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: Spacing.sm }}>
              <Text style={styles.primaryText}>{getDisplayName(item)}</Text>
              <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginTop: 4 }}>HSN: {item.hsnCode}</Text>
            </View>
            <Ionicons 
              name={isExpanded ? 'chevron-down-circle' : 'chevron-forward-circle'} 
              size={20} 
              color={colors.primary} 
            />
          </View>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm, flexWrap: 'wrap', gap: Spacing.sm }}>
            <View>
              <Text style={{ ...Typography.eyebrow, color: colors.text.secondary }}>STOCK</Text>
              <StockDisplay qtyBoxes={item.totalBoxes} packing={item.vendorDetails[0]?.packing || 1} textStyle={{ ...Typography.bodySm, fontWeight: '700' }} />
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={{ ...Typography.eyebrow, color: colors.text.secondary }}>Vendors</Text>
              <Text style={{ ...Typography.bodySm, textAlign: 'right' }} numberOfLines={2}>
                {uniqueVendors.map(v => formatVendorDisplay(v)).join(', ')}
              </Text>
            </View>
          </View>

          {isLowStock && (
            <View style={{ backgroundColor: colors.warning + '20', borderColor: colors.warning + '60', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4, marginTop: Spacing.sm, alignSelf: 'flex-start' }}>
              <Text style={{ ...Typography.eyebrow, fontWeight: '800', color: colors.warning }}>
                 LOW STOCK ({item.totalBoxes}/{minReorderVal})
              </Text>
            </View>
          )}
        </Pressable>
        {isExpanded && (
          <View style={[styles.expandedContent, { borderTopWidth: 1, borderTopColor: colors.border, padding: Spacing.md }]}>
            {/* Same expanded content but customized for mobile */}
            {item.vendorDetails.map((vd: any, idx: number) => (
              <View key={idx} style={{ marginBottom: Spacing.md, paddingBottom: Spacing.md, borderBottomWidth: idx === item.vendorDetails.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
                <Text style={{ ...Typography.bodySm, fontWeight: '700' }}>{formatVendorDisplay(vd.vendorName)}</Text>
                <Text style={{ ...Typography.eyebrow, color: colors.text.secondary, marginTop: 2 }}>
                  Batch: {vd.batchNo || 'N/A'} • Exp: {vd.expiryDate ? new Date(vd.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'N/A'}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ ...Typography.caption, color: colors.success }}>MRP: ₹{vd.mrp}</Text>
                  <Text style={{ ...Typography.caption }}>Stock: {vd.qtyBoxes} Box</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: Spacing.sm }}>
                  <TouchableOpacity style={[styles.btnSmall, { backgroundColor: colors.primary, flex: 1 }]} onPress={() => onAdjustStock(vd)}>
                    <Ionicons name="create-outline" size={14} color="#fff" />
                    <Text style={{ ...Typography.eyebrow, color: '#fff', fontWeight: '700', textAlign: 'center' }}>Adjust</Text>
                  </TouchableOpacity>
                  {isConsolidated && perm.can('inventory:edit') && idx === 0 && (
                    <TouchableOpacity style={[styles.btnSmall, { backgroundColor: colors.success, flex: 1 }]} onPress={() => onAddStock(item.productId)}>
                      <Ionicons name="add-circle" size={14} color="#fff" />
                      <Text style={{ ...Typography.eyebrow, color: '#fff', fontWeight: '700', textAlign: 'center' }}>Restock</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
            <TouchableOpacity style={[styles.btnSmall, { backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' }]} onPress={() => onShowLedger({ id: item.productId, name: getDisplayName(item), packing: item.vendorDetails[0]?.packing, vendorId: item.vendorDetails[0]?.vendorId })}>
              <Ionicons name="list" size={14} color={colors.text.primary} />
              <Text style={{ ...Typography.eyebrow, color: colors.text.primary, fontWeight: '700' }}>View Ledger</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.expandableGroupContainer, { borderLeftWidth: 4, borderLeftColor: isLowStock ? colors.warning : 'transparent' }]}>
      <Pressable
        style={({ pressed }) => [
          styles.tableBodyRow,
          isLowStock ? { backgroundColor: colors.warning + '12' } : (pressed ? { backgroundColor: colors.bg.secondary } : {})
        ]}
        onPress={onToggleExpand}
      >
        <View style={[styles.tableCellContainer, { width: 40, alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons 
            name={isExpanded ? 'chevron-down-circle' : 'chevron-forward-circle'} 
            size={18} 
            color={colors.primary} 
          />
        </View>

        <View style={[styles.tableCellContainer, { flex: 2.5 }]}>
          <Text style={styles.primaryText}>{getDisplayName(item)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
            <Text style={{ ...Typography.eyebrow, color: colors.text.muted }}>HSN: {item.hsnCode}</Text>
            {isLowStock && (
              <View style={{ backgroundColor: colors.warning + '20', borderColor: colors.warning + '60', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                <Text style={{ ...Typography.eyebrow, fontWeight: '800', color: colors.warning }}>
                   LOW STOCK ({item.totalBoxes}/{minReorderVal})
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.tableCellContainer, { flex: 1.8 }]}>
          <Text style={styles.tableCell} numberOfLines={1}>
            {uniqueVendors.map(v => formatVendorDisplay(v)).join(', ')}
          </Text>
        </View>

        <View style={[styles.tableCellContainer, { flex: 2.2, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }]}>
          {isConsolidated ? (
            item.warehouses.map((w: any, idx: number) => (
              <View key={idx} style={[styles.warehouseBadge, { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }]}>
                <Text style={styles.warehouseBadgeText}>
                  {w.warehouseName}: 
                </Text>
                <View style={{ marginLeft: 4 }}>
                  <StockDisplay qtyBoxes={w.qtyBoxes} packing={item.vendorDetails[0]?.packing || 1} textStyle={{ ...Typography.eyebrow, color: colors.text.primary }} />
                </View>
              </View>
            ))
          ) : (
            <StatusPill  label={<>
                {currentWarehouseName}
              </>} textStyle={styles.warehouseBadgeText} />
          )}
        </View>

        <View style={[styles.tableCellContainer, { flex: 1.2, borderRightWidth: 0 }]}>
          <StockDisplay 
            qtyBoxes={item.totalBoxes} 
            packing={item.vendorDetails[0]?.packing || 1} 
            textStyle={{ ...Typography.bodySm, fontWeight: '700' }} 
          />
          <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginTop: 2 }}>
            across {item.vendorDetails.length} batch{item.vendorDetails.length !== 1 ? 'es' : ''}
          </Text>
        </View>
      </Pressable>

      {isExpanded && (
        <View style={styles.expandedBreakdownArea}>
          {item.vendorDetails.length === 0 ? (
            <View style={styles.expandedBreakdownRow}>
              <View style={{ width: 40 }} />
              <Pressable
                style={{ flex: 2.5, paddingLeft: 10 }}
                onPress={() => onShowLedger({ id: item.productId, name: getDisplayName(item), vendorId: '' })}
              >
                <Text style={styles.breakdownVendorText}>↳ No Stock History</Text>
              </Pressable>
              <View style={{ flex: 1.8 }} />
              <View style={{ flex: 2.2 }} />
              <Pressable
                style={{ flex: 1.2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 8 }}
                onPress={() => onShowLedger({ id: item.productId, name: getDisplayName(item), vendorId: '' })}
              >
                <View>
                  <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.primary }}>0 Boxes</Text>
                </View>
                <View style={styles.breakdownActionBadge}>
                  <Ionicons name="clipboard-outline" size={10} color={colors.text.secondary} />
                  <Text style={styles.breakdownActionText}>Ledger</Text>
                </View>
              </Pressable>
            </View>
          ) : (
            item.vendorDetails.map((vd: any, idx: number) => (
              <View
                key={idx}
                style={[
                  styles.expandedBreakdownRow,
                  idx !== item.vendorDetails.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border + '30' }
                ]}
              >
                <View style={{ width: 40 }} />

                <Pressable
                  style={{ flex: 2.5, paddingLeft: 10 }}
                  onPress={() => onShowLedger({ id: item.productId, name: `${getDisplayName(item)} (${vd.vendorName})`, packing: vd.packing, vendorId: vd.vendorId })}
                >
                  <Text style={styles.breakdownVendorText}>↳ {formatVendorDisplay(vd.vendorName)}</Text>
                  <Text style={styles.breakdownPackingText}>Packing: {vd.packing} Pcs/Box</Text>
                  {vd.batchNo ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                      <Text style={[styles.breakdownPackingText, { color: colors.warning, fontWeight: '700' }]}>
                        Batch: {vd.batchNo}
                      </Text>
                      {vd.manufacturingUnitName ? (
                        <View style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                          <Text style={{ ...Typography.eyebrow, fontWeight: '800', color: colors.primary }}>
                             {vd.manufacturingUnitName}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  {(vd.mfgDate || vd.expiryDate) ? (() => {
                    const now = new Date();
                    const expDate = vd.expiryDate ? new Date(vd.expiryDate) : null;
                    const daysLeft = expDate ? Math.floor((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
                    const expiryColor = daysLeft === null ? colors.text.muted
                      : daysLeft < 0 ? '#ef4444'
                      : daysLeft <= 30 ? '#f97316'
                      : daysLeft <= 90 ? '#eab308'
                      : colors.text.muted;
                    const expiryLabel = daysLeft === null ? ''
                      : daysLeft < 0 ? '  EXPIRED'
                      : daysLeft <= 30 ? `  ${daysLeft}d left`
                      : daysLeft <= 90 ? ` (${daysLeft}d)`
                      : '';
                    return (
                      <Text style={{ ...Typography.eyebrow, color: expiryColor, marginTop: 2, fontWeight: daysLeft !== null && daysLeft <= 30 ? '700' : '400' }}>
                        {vd.mfgDate ? `Mfg: ${new Date(vd.mfgDate).toLocaleDateString('en-IN')}` : ''}
                        {vd.mfgDate && vd.expiryDate ? ' | ' : ''}
                        {vd.expiryDate ? `Exp: ${new Date(vd.expiryDate).toLocaleDateString('en-IN')}${expiryLabel}` : ''}
                      </Text>
                    );
                  })() : null}
                </Pressable>

                <View style={{ flex: 1.8 }} />

                <View style={{ flex: 2.2, flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-start', alignItems: 'center' }}>
                  {isConsolidated ? (
                    vd.warehouses.map((w: any, wIdx: number) => (
                      <View key={wIdx} style={[styles.warehouseBadge, { backgroundColor: colors.primary + '08', borderColor: colors.primary + '20', flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }]}>
                        <Text style={[styles.warehouseBadgeText, { color: colors.primary }]}>
                          {w.warehouseName}: 
                        </Text>
                        <View style={{ marginLeft: 4 }}>
                          <StockDisplay qtyBoxes={w.qtyBoxes} packing={vd.packing} textStyle={{ ...Typography.eyebrow, color: colors.primary }} />
                        </View>
                      </View>
                    ))
                  ) : (
                    <>
                      {vd.warehouses.map((wh: any, wIdx: number) => (
                        <StatusPill key={wIdx} label={<>
                            {wh.warehouseName}
                          </>} textStyle={styles.warehouseBadgeText} />
                      ))}
                      {perm.can('inventory:edit') && (
                        <TouchableOpacity
                          style={styles.actionBtnSecondary}
                          onPress={() => onAdjustStock(vd)}
                        >
                          <Ionicons name="options-outline" size={14} color={colors.primary} />
                          <Text style={styles.actionBtnSecondaryText}>Adjust Stock</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>

                <Pressable
                  style={{ flex: 1.2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 8 }}
                  onPress={() => onShowLedger({ id: item.productId, name: `${getDisplayName(item)} (${vd.vendorName})`, packing: vd.packing, vendorId: vd.vendorId })}
                >
                  <View>
                    <StockDisplay 
                      qtyBoxes={vd.qtyBoxes} 
                      packing={vd.packing} 
                      textStyle={{ ...Typography.bodySm, fontWeight: '700' }} 
                    />
                    <Text style={{ ...Typography.eyebrow, color: colors.text.muted }}>Subtotal</Text>
                  </View>
                  <View style={styles.breakdownActionBadge}>
                    <Ionicons name="clipboard-outline" size={10} color={colors.text.secondary} />
                    <Text style={styles.breakdownActionText}>Ledger</Text>
                  </View>
                </Pressable>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}, (prev, next) => {
  return prev.isExpanded === next.isExpanded && prev.item.totalBoxes === next.item.totalBoxes && prev.item.productId === next.item.productId && prev.isConsolidated === next.isConsolidated;
});

// Styling creator
const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  innerContainer: { flex: 1, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  
  topHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  topHeaderTitle: { ...Typography.h1, fontWeight: '800', color: colors.text.primary },
  headerBtnPrimary: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, borderRadius: Radius.md, paddingHorizontal: 16, height: 40, gap: 8, borderWidth: 1, borderColor: colors.primary },
  headerBtnText: { ...Typography.bodySm, color: '#fff', fontWeight: '700' },

  summaryBar: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: colors.bg.card, marginHorizontal: Spacing.lg, marginTop: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.lg },
  summaryItem: { alignItems: 'center' },
  summaryLabel: { ...Typography.eyebrow, fontWeight: '700', color: colors.text.muted, marginBottom: 4 },
  summaryValue: { ...Typography.h2, fontWeight: '800', color: colors.text.primary },
  summaryDivider: { width: 1, height: 26, backgroundColor: colors.border },
  
  controlsBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', backgroundColor: colors.bg.card, marginHorizontal: Spacing.lg, marginVertical: Spacing.md, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, gap: 10, zIndex: 1100 },
  searchInput: { borderWidth: 0, backgroundColor: 'transparent', ...Typography.body, flex: 1, height: 46, color: colors.text.primary },

  filterDropdownButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, height: 36, gap: 6 },
  filterDropdownButtonText: { ...Typography.bodySm, fontWeight: '700', color: colors.text.secondary },
  filterDropdownPanel: { position: 'absolute', top: 52, right: Spacing.lg, backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, width: 280, zIndex: 9999, ...Shadows.floating },
  filterDropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterDropdownItemActive: { backgroundColor: colors.primary + '08' },
  filterDropdownItemText: { ...Typography.bodySm, color: colors.text.primary },

  // Control sub bar & vendor filter
  controlSubBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: Spacing.lg, marginBottom: Spacing.md, gap: 12, zIndex: 1050 },
  vendorDropdownPanel: { position: 'absolute', top: 52, right: 180, backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, width: 250, zIndex: 9999, ...Shadows.floating },

  table: { width: '100%', backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, marginVertical: Spacing.md, overflow: 'hidden', flex: 1 },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary, alignItems: 'center', borderLeftWidth: 4, borderLeftColor: 'transparent' },
  tableHeaderCell: { ...Typography.caption, fontWeight: '800', color: colors.text.muted },
  tableHeaderCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  tableBodyRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  tableCell: { ...Typography.bodySm, color: colors.text.primary },
  tableCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  primaryText: { ...Typography.bodySm, fontWeight: '700', color: colors.text.primary },
  emptyText: { ...Typography.bodySm, color: colors.text.muted, textAlign: 'center', marginTop: 10 },
  emptyTableContainer: { padding: 40, alignItems: 'center', justifyContent: 'center', width: '100%' },

  warehouseBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border },
  warehouseBadgeText: { ...Typography.caption, color: colors.text.secondary, fontWeight: '600' },

  actionBtnSecondary: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 5, gap: 4, backgroundColor: colors.primary + '08' },
  actionBtnSecondaryText: { ...Typography.bodySm, color: colors.primary, fontWeight: '700' },

  // Grouped and Expandable sub-rows
  expandableGroupContainer: { borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.card },
  expandedBreakdownArea: { backgroundColor: colors.bg.primary + '30', borderLeftWidth: 3, borderLeftColor: colors.primary, paddingVertical: 4 },
  expandedBreakdownRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  breakdownVendorText: { ...Typography.bodySm, fontWeight: '700', color: colors.text.primary },
  breakdownPackingText: { ...Typography.eyebrow, color: colors.text.muted, marginTop: 2 },
  breakdownActionBadge: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: colors.bg.secondary, gap: 4 },
  breakdownActionText: { ...Typography.eyebrow, fontWeight: '700', color: colors.text.secondary },

  // Modals Styling
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  dialogSheet: { width: '90%', maxWidth: 500, maxHeight: '90%', flexDirection: 'column', backgroundColor: colors.bg.secondary, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.lg, ...Shadows.modal },
  dialogContainer: { width: '100%', flex: 1 },
  dialogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 10, marginBottom: 8 },
  dialogTitle: { ...Typography.h2, fontWeight: '800', color: colors.text.primary },
  
  formGroup: { marginBottom: 14 },
  formRow: { flexDirection: 'row' },
  formLabel: { ...Typography.caption, fontWeight: '700', color: colors.text.secondary, marginBottom: 4 },
  formInput: { ...Typography.body, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 42, color: colors.text.primary },
  errorText: { ...Typography.bodySm, color: colors.danger, fontWeight: '700', marginBottom: 12, backgroundColor: colors.danger + '10', padding: 8, borderRadius: Radius.sm, borderLeftWidth: 3, borderLeftColor: colors.danger },

  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  dialogCancel: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  dialogSave: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },

  // Custom Selector Dropdowns inside Modals
  customSelectTrigger: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 42 },
  customSearchSelectContainer: { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  clearProductSelection: { position: 'absolute', right: 12 },
  customSelectPanel: { backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, marginTop: 4, overflow: 'hidden', ...Shadows.floating },
  customSelectItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  customSelectItemText: { ...Typography.bodySm, color: colors.text.primary, fontWeight: '700' },
  customSelectItemSubtext: { ...Typography.eyebrow, color: colors.text.muted, marginTop: 2 },

  // Adjustment Type
  adjustmentTypeContainer: { flexDirection: 'row', gap: 8, marginTop: 2 },
  adjustmentTypeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.card, borderRadius: Radius.md, paddingVertical: 8, gap: 4 },
  adjustmentTypeBtnText: { ...Typography.caption, fontWeight: '700', color: colors.text.secondary },

  // Ledger sheets (Wider modal for ledger logs)
  ledgerSheet: { width: '98%', maxWidth: 1200, height: '88%', backgroundColor: colors.bg.secondary, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.lg, ...Shadows.modal },
  ledgerTable: { width: '100%', backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  ledgerHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary, paddingVertical: 10, paddingHorizontal: 10, alignItems: 'center' },
  ledgerHeaderCell: { ...Typography.eyebrow, fontWeight: '800', color: colors.text.muted },
  ledgerBodyRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 10, paddingHorizontal: 10, alignItems: 'center' },
  ledgerCell: { ...Typography.bodySm, color: colors.text.primary, paddingRight: 6 },
  
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
  typeBadgeText: { ...Typography.eyebrow, fontWeight: '800' },
  
  ledgerRefText: { ...Typography.caption, fontWeight: '700', color: colors.text.secondary },
  ledgerNoteText: { ...Typography.eyebrow, color: colors.text.muted, marginTop: 1 },

  // Transfers Layout Overrides
  col10: { flex: 1 },
  col12: { flex: 1.2 },
  col15: { flex: 1.5 },
  col18: { flex: 1.8 },
  col20: { flex: 2 },
  colNoBorder: { borderRightWidth: 0 },
  statusBadgeContainer: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
  actionsCell: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  btnSmall: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  btnCenter: { padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginVertical: 16, alignSelf: 'center', width: 200, flexDirection: 'row', gap: 8 }
});
