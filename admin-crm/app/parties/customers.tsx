import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Pressable, StyleSheet, RefreshControl, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors } from '../../constants/theme';
import { api, Customer, Invoice, getApiBaseUrl } from '../../utils/api';
import { useAuth } from '../../utils/auth';
import { usePermission } from '../../utils/permissions';
import { useTheme, useStyles } from '../../utils/themeContext';

import { FIRM_DETAILS } from '../../constants/firm';
import { AddPaymentModal } from '../payments';

const GST_STATE_CODES: { [key: string]: string } = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory'
};

const getAvatarColor = (name: string, colors: any) => {
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const palettes = [
    { bg: colors.primary + '15', text: colors.primary },
    { bg: colors.success + '15', text: colors.success },
    { bg: colors.warning + '15', text: colors.warning },
    { bg: colors.danger + '15', text: colors.danger },
    { bg: colors.info + '15', text: colors.info },
    { bg: '#8A2BE215', text: '#8A2BE2' },
    { bg: '#FF00FF15', text: '#FF00FF' },
  ];
  return palettes[hash % palettes.length];
};

function CustomerDetailModal({
  customer, visible, onClose, onDeleted, onEdit
}: { customer: Customer | null; visible: boolean; onClose: () => void; onDeleted: () => void; onEdit: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuth();
  const perm = usePermission();
  const canAccessCash = user?.canAccessCash ?? false;

  const [customerOrders, setCustomerOrders] = React.useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = React.useState(false);

  React.useEffect(() => {
    if (visible && customer) {
      const fetchOrders = async () => {
        setLoadingOrders(true);
        try {
          const query = customer.phone || customer.email || '';
          if (query) {
            const res = await fetch(`${getApiBaseUrl()}/orders/public/track/${encodeURIComponent(query)}`);
            if (res.ok) {
              const data = await res.json();
              setCustomerOrders(data);
            }
          }
        } catch (err) {
          console.error('Failed to load customer orders:', err);
        } finally {
          setLoadingOrders(false);
        }
      };
      fetchOrders();
    }
  }, [visible, customer]);

  const getOrderStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return colors.danger;
      case 'processing': return colors.warning;
      case 'shipped': return colors.primary;
      case 'delivered': return colors.success;
      default: return colors.primary;
    }
  };

  if (!customer) return null;

  const handleDelete = async () => {
    try {
      const success = await api.deleteCustomer(customer._id);
      if (success) {
        onDeleted();
        onClose();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete customer');
    }
  };

  const isCash = !customer.gstin || !customer.gstin.trim();
  const billing = customer.billingAddress || { street: '', city: '', pin: '', state: '' };
  const shipping = customer.shippingAddress || { street: '', city: '', pin: '', state: '' };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Customer Details</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          <View style={styles.profileHeader}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>{(customer.company || customer.name || 'C').charAt(0)}</Text>
            </View>
            <Text style={styles.profileName}>{customer.company || customer.name || 'N/A'}</Text>
            {customer.company && customer.name ? (
              <Text style={styles.profileCompany}>{`Contact: ${customer.name}`}</Text>
            ) : null}

            {isCash ? (
              <View style={[styles.gstinBadge, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '30', borderWidth: 1, marginTop: 8, alignSelf: 'center' }]}>
                <Ionicons name="cash" size={11} color={colors.warning} />
                <Text style={[styles.gstinText, { color: colors.warning, fontSize: 11 }]}>Cash Customer</Text>
              </View>
            ) : (
              <View style={[styles.gstinBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '30', borderWidth: 1, marginTop: 8, alignSelf: 'center' }]}>
                <Ionicons name="business" size={11} color={colors.primary} />
                <Text style={[styles.gstinText, { color: colors.primary, fontSize: 11 }]}>GST Customer</Text>
              </View>
            )}
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoSectionHeader}>
              <Text style={styles.infoSectionTitle}>General Profile</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="person" size={16} color={colors.primary} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>Contact Person</Text>
                <Text style={styles.infoValue}>{customer.contactPerson || customer.name || 'N/A'}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="call" size={16} color={colors.success} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>Phone Number</Text>
                <Text style={styles.infoValue}>{customer.phone || 'N/A'}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="mail" size={16} color={colors.info} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{customer.email || 'N/A'}</Text>
              </View>
            </View>

            {!isCash && (
              <>
                <View style={styles.infoSectionHeader}>
                  <Text style={styles.infoSectionTitle}>Tax & Statutory Information</Text>
                </View>
                <View style={styles.infoItem}>
                  <Ionicons name="finger-print" size={16} color={colors.primary} style={styles.infoIcon} />
                  <View>
                    <Text style={styles.infoLabel}>GSTIN</Text>
                    <Text style={styles.infoValue}>{customer.gstin || 'Not Provided'}</Text>
                  </View>
                </View>
                <View style={styles.infoItem}>
                  <Ionicons name="card" size={16} color={colors.warning} style={styles.infoIcon} />
                  <View>
                    <Text style={styles.infoLabel}>PAN (Extracted)</Text>
                    <Text style={styles.infoValue}>{customer.pan || 'N/A'}</Text>
                  </View>
                </View>
                <View style={styles.infoItem}>
                  <Ionicons name="map" size={16} color={colors.info} style={styles.infoIcon} />
                  <View>
                    <Text style={styles.infoLabel}>Place of Supply (GST)</Text>
                    <Text style={styles.infoValue}>{customer.placeOfSupply || customer.state || 'N/A'}</Text>
                  </View>
                </View>
              </>
            )}

            <View style={styles.infoSectionHeader}>
              <Text style={styles.infoSectionTitle}>Billing Address</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="location" size={16} color={colors.text.muted} style={styles.infoIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Address</Text>
                <Text style={styles.infoValue} numberOfLines={3}>
                  {billing.street || '—'}{'\n'}
                  {billing.city ? `${billing.city} ` : ''}
                  {billing.pin ? `- ${billing.pin}` : ''}
                  {billing.state ? `, ${billing.state}` : ''}
                </Text>
              </View>
            </View>

            <View style={styles.infoSectionHeader}>
              <Text style={styles.infoSectionTitle}>Shipping Address</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="location-outline" size={16} color={colors.text.muted} style={styles.infoIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Address</Text>
                {customer.shippingSameAsBilling ? (
                  <Text style={[styles.infoValue, { fontStyle: 'italic', color: colors.text.muted }]}>
                    Same as Billing Address
                  </Text>
                ) : (
                  <Text style={styles.infoValue} numberOfLines={3}>
                    {shipping.street || '—'}{'\n'}
                    {shipping.city ? `${shipping.city} ` : ''}
                    {shipping.pin ? `- ${shipping.pin}` : ''}
                    {shipping.state ? `, ${shipping.state}` : ''}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.infoSectionHeader}>
              <Text style={styles.infoSectionTitle}>Outstanding Balances & Terms</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="cash" size={16} color={colors.success} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>Invoice Balance (GST) {customer.recordTracking !== 'cash_ledger' ? '⭐ (Active Ledger)' : ''}</Text>
                <Text style={[styles.infoValue, { color: customer.regularBalance > 0 ? colors.success : colors.text.muted }]}>
                  ₹{customer.regularBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </View>

            <View style={styles.infoItem}>
              <Ionicons name="wallet-outline" size={16} color={colors.warning} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>Challan Balance (Cash/No GST) {customer.recordTracking === 'cash_ledger' ? '⭐ (Active Ledger)' : ''}</Text>
                <Text style={[styles.infoValue, { color: (customer.cashBalance || 0) > 0 ? colors.warning : colors.text.muted }]}>
                  ₹{(customer.cashBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </View>

            <View style={styles.infoItem}>
              <Ionicons name="ribbon" size={16} color={colors.primary} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>Sales Volume & Payment Terms</Text>
                <Text style={styles.infoValue}>₹{customer.salesVolume.toLocaleString()} | {customer.paymentTerms || 'Net 30'}</Text>
              </View>
            </View>

          </View>

          {/* Storefront E-Commerce Order History */}
          <View style={{ marginTop: 20 }}>
            <View style={styles.infoSectionHeader}>
              <Text style={styles.infoSectionTitle}>Storefront Order History</Text>
            </View>

            {loadingOrders ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
            ) : customerOrders.length === 0 ? (
              <Text style={{ fontSize: 13, color: colors.text.muted, marginVertical: 8, fontStyle: 'italic' }}>
                No storefront orders found matching this customer's details.
              </Text>
            ) : (
              <View style={{ gap: 8, marginTop: 8 }}>
                {customerOrders.map((o) => (
                  <View key={o._id} style={{
                    backgroundColor: colors.bg.secondary,
                    borderRadius: 8,
                    padding: 12,
                    borderLeftWidth: 3,
                    borderLeftColor: getOrderStatusColor(o.status),
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', fontFamily: 'monospace', color: colors.text.primary }}>
                        #{o._id.substring(o._id.length - 8).toUpperCase()}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                        Date: {new Date(o.createdAt).toLocaleDateString()}  |  Amt: ₹{o.totalAmount}
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: getOrderStatusColor(o.status) + '15',
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 4,
                      borderWidth: 1,
                      borderColor: getOrderStatusColor(o.status)
                    }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: getOrderStatusColor(o.status), textTransform: 'uppercase' }}>
                        {o.status}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 16 }}>
            <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={styles.editBtnText}>Edit Details</Text>
            </TouchableOpacity>
            {perm.can('customer:delete') && (
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={16} color="#fff" />
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function AddEditCustomerModal({
  visible, onClose, onSaved, customer
}: { visible: boolean; onClose: () => void; onSaved: () => void; customer?: Customer | null }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useStyles(createStyles);
  const canAccessCash = user?.canAccessCash ?? false;

  const [customerType, setCustomerType] = useState<'gst' | 'cash'>('gst');
  const [recordTracking, setRecordTracking] = useState<'invoice_ledger' | 'cash_ledger'>('invoice_ledger');
  const [company, setCompany] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [selectedDropdownTerm, setSelectedDropdownTerm] = useState('Net 30');
  const [showTermsDropdown, setShowTermsDropdown] = useState(false);

  const standardTerms = ['Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90'];

  const handleDropdownTermChange = (value: string) => {
    setSelectedDropdownTerm(value);
    if (value !== 'Custom') {
      setPaymentTerms(value);
    } else {
      if (standardTerms.includes(paymentTerms)) {
        setPaymentTerms('');
      }
    }
  };

  // Billing Address
  const [billingStreet, setBillingStreet] = useState('');
  const [billingPin, setBillingPin] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingState, setBillingState] = useState('Maharashtra');

  // Shipping Address Same Checkbox
  const [shippingSameAsBilling, setShippingSameAsBilling] = useState(false);

  // Shipping Address
  const [shippingStreet, setShippingStreet] = useState('');
  const [shippingPin, setShippingPin] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingState, setShippingState] = useState('Maharashtra');

  // Balances
  const [regularBalance, setRegularBalance] = useState('');
  const [cashBalance, setCashBalance] = useState('');

  const [salesVolume, setSalesVolume] = useState('');

  const [loadingBillingPin, setLoadingBillingPin] = useState(false);
  const [loadingShippingPin, setLoadingShippingPin] = useState(false);
  const [loadingGst, setLoadingGst] = useState(false);

  useEffect(() => {
    if (customer) {
      setCustomerType(customer.customerType || 'gst');
      setCompany(customer.company || '');
      setContactPerson(customer.contactPerson || customer.name || '');
      setPhone(customer.phone || '');
      setEmail(customer.email || '');
      setGstin(customer.gstin || '');
      setPan(customer.pan || '');
      setPlaceOfSupply(customer.placeOfSupply || customer.state || '');

      const currentTerms = customer.paymentTerms || 'Net 30';
      setPaymentTerms(currentTerms);
      if (standardTerms.includes(currentTerms)) {
        setSelectedDropdownTerm(currentTerms);
      } else {
        setSelectedDropdownTerm('Custom');
      }

      const billing = customer.billingAddress || { street: '', pin: '', city: '', state: '' };
      setBillingStreet(billing.street || '');
      setBillingPin(billing.pin || '');
      setBillingCity(billing.city || '');
      setBillingState(billing.state || 'Maharashtra');

      setShippingSameAsBilling(!!customer.shippingSameAsBilling);

      const shipping = customer.shippingAddress || { street: '', pin: '', city: '', state: '' };
      setShippingStreet(shipping.street || '');
      setShippingPin(shipping.pin || '');
      setShippingCity(shipping.city || '');
      setShippingState(shipping.state || 'Maharashtra');

      setRegularBalance(customer.regularBalance.toString());
      setCashBalance(customer.cashBalance ? customer.cashBalance.toString() : '0');
      setRecordTracking(customer.recordTracking || 'invoice_ledger');

      setSalesVolume(customer.salesVolume.toString());
    } else {
      setCustomerType('gst');
      setRecordTracking('invoice_ledger');
      setCompany('');
      setContactPerson('');
      setPhone('');
      setEmail('');
      setGstin('');
      setPan('');
      setPlaceOfSupply('');
      setPaymentTerms('Net 30');
      setSelectedDropdownTerm('Net 30');
      setShowTermsDropdown(false);
      setBillingStreet('');
      setBillingPin('');
      setBillingCity('');
      setBillingState('Maharashtra');
      setShippingSameAsBilling(false);
      setShippingStreet('');
      setShippingPin('');
      setShippingCity('');
      setShippingState('Maharashtra');
      setRegularBalance('');
      setCashBalance('');

      setSalesVolume('');
    }
  }, [customer, visible]);

  // GSTIN Changes -> Extract PAN and Place of Supply State
  const handleGstinChange = (val: string) => {
    setGstin(val);
    const cleaned = val.trim().toUpperCase();

    // PAN Extract (char 3 to 12)
    if (cleaned.length >= 12) {
      const panPart = cleaned.substring(2, 12);
      if (/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panPart)) {
        setPan(panPart);
      }
    }

    // Place of supply extract (char 1-2 state code)
    if (cleaned.length >= 2) {
      const stateCode = cleaned.substring(0, 2);
      const stateName = GST_STATE_CODES[stateCode];
      if (stateName) {
        setPlaceOfSupply(stateName);
      }
    }
  };

  const handleAutoFillGst = async () => {
    if (!gstin.trim()) {
      alert('Please enter a GSTIN first.');
      return;
    }
    setLoadingGst(true);
    try {
      const data = await api.verifyGSTIN(gstin.trim());
      setCompany(data.companyName);
      setContactPerson(data.companyName.split('(')[0].trim());
      setBillingStreet(data.billingAddress);
      setBillingState(data.state);
      setPlaceOfSupply(data.placeOfSupply);

      if (gstin.length >= 12) {
        setPan(gstin.substring(2, 12).toUpperCase());
      }

      alert('GSTIN verified & profile auto-filled!');
    } catch (err: any) {
      alert(err.message || 'Verification failed. Please check GSTIN format.');
    } finally {
      setLoadingGst(false);
    }
  };

  // Billing Pin Change Handler
  const handleBillingPinChange = async (val: string) => {
    setBillingPin(val);
    if (val.length === 6 && /^\d+$/.test(val)) {
      setLoadingBillingPin(true);
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${val}`);
        const data = await res.json();
        if (data && data[0] && data[0].Status === 'Success') {
          const postOffice = data[0].PostOffice[0];
          const city = postOffice.District || postOffice.Name || '';
          const state = postOffice.State || 'Maharashtra';
          setBillingCity(city);
          setBillingState(state);

          if (shippingSameAsBilling) {
            setShippingCity(city);
            setShippingState(state);
            setShippingPin(val);
          }
        }
      } catch (err) {
        console.log('PIN lookup error:', err);
      } finally {
        setLoadingBillingPin(false);
      }
    }
  };

  // Shipping Pin Change Handler
  const handleShippingPinChange = async (val: string) => {
    setShippingPin(val);
    if (val.length === 6 && /^\d+$/.test(val)) {
      setLoadingShippingPin(true);
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${val}`);
        const data = await res.json();
        if (data && data[0] && data[0].Status === 'Success') {
          const postOffice = data[0].PostOffice[0];
          setShippingCity(postOffice.District || postOffice.Name || '');
          setShippingState(postOffice.State || 'Maharashtra');
        }
      } catch (err) {
        console.log('PIN lookup error:', err);
      } finally {
        setLoadingShippingPin(false);
      }
    }
  };

  // Checkbox Change Handler
  const handleCheckboxChange = (checked: boolean) => {
    setShippingSameAsBilling(checked);
    if (checked) {
      setShippingStreet(billingStreet);
      setShippingPin(billingPin);
      setShippingCity(billingCity);
      setShippingState(billingState);
    }
  };

  const handleSave = async () => {
    const isCash = customerType === 'cash';
    const primaryName = isCash ? contactPerson.trim() : company.trim();

    if (!primaryName) {
      alert(isCash ? 'Customer / Contact Name is required' : 'Company Name is required');
      return;
    }

    const payload = {
      name: contactPerson.trim() || company.trim(),
      company: isCash ? '' : company.trim(),
      contactPerson: contactPerson.trim(),
      phone: phone.trim(),
      email: email.trim(),
      customerType,
      recordTracking,
      gstin: isCash ? '' : gstin.trim().toUpperCase(),
      pan: isCash ? '' : pan.trim().toUpperCase(),
      placeOfSupply: isCash ? '' : placeOfSupply.trim(),
      state: placeOfSupply.trim() || billingState,
      paymentTerms: paymentTerms.trim(),
      billingAddress: {
        street: billingStreet.trim(),
        pin: billingPin.trim(),
        city: billingCity.trim(),
        state: billingState.trim()
      },
      shippingAddress: {
        street: shippingSameAsBilling ? billingStreet.trim() : shippingStreet.trim(),
        pin: shippingSameAsBilling ? billingPin.trim() : shippingPin.trim(),
        city: shippingSameAsBilling ? billingCity.trim() : shippingCity.trim(),
        state: shippingSameAsBilling ? billingState.trim() : shippingState.trim()
      },
      shippingSameAsBilling,
      regularBalance: isCash ? 0 : (parseInt(regularBalance) || 0),
      cashBalance: canAccessCash ? (parseInt(cashBalance) || 0) : 0,

      salesVolume: parseInt(salesVolume) || 0,
    };

    try {
      if (customer) {
        await api.updateCustomer(customer._id, payload);
      } else {
        await api.createCustomer(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to save customer details');
    }
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{customer ? 'Edit Customer' : 'New Customer'}</Text>
          <TouchableOpacity onPress={handleSave}>
            <Ionicons name="checkmark-circle" size={26} color={colors.success} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          {canAccessCash && (
            <>
              <View style={styles.formSectionHeader}><Text style={styles.formSectionTitle}>Customer Type Selection</Text></View>

              <View style={styles.formGroup}>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                  <TouchableOpacity
                    style={[
                      styles.typeSelectorBtn,
                      customerType === 'gst' && { backgroundColor: colors.primary + '18', borderColor: colors.primary }
                    ]}
                    onPress={() => setCustomerType('gst')}
                  >
                    <Ionicons name="business-outline" size={16} color={customerType === 'gst' ? colors.primary : colors.text.muted} />
                    <Text style={[styles.typeSelectorText, { color: customerType === 'gst' ? colors.primary : colors.text.secondary }]}>
                      GST Registered
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeSelectorBtn,
                      customerType === 'cash' && { backgroundColor: colors.warning + '18', borderColor: colors.warning }
                    ]}
                    onPress={() => setCustomerType('cash')}
                  >
                    <Ionicons name="cash-outline" size={16} color={customerType === 'cash' ? colors.warning : colors.text.muted} />
                    <Text style={[styles.typeSelectorText, { color: customerType === 'cash' ? colors.warning : colors.text.secondary }]}>
                      Cash / Unregistered
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formSectionHeader}><Text style={styles.formSectionTitle}>Ledger / Record Tracking style</Text></View>

              <View style={styles.formGroup}>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                  <TouchableOpacity
                    style={[
                      styles.typeSelectorBtn,
                      recordTracking === 'invoice_ledger' && { backgroundColor: colors.primary + '18', borderColor: colors.primary }
                    ]}
                    onPress={() => setRecordTracking('invoice_ledger')}
                  >
                    <Ionicons name="receipt-outline" size={16} color={recordTracking === 'invoice_ledger' ? colors.primary : colors.text.muted} />
                    <Text style={[styles.typeSelectorText, { color: recordTracking === 'invoice_ledger' ? colors.primary : colors.text.secondary }]}>
                      GST / Regular Invoice Ledger
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeSelectorBtn,
                      recordTracking === 'cash_ledger' && { backgroundColor: colors.warning + '18', borderColor: colors.warning }
                    ]}
                    onPress={() => setRecordTracking('cash_ledger')}
                  >
                    <Ionicons name="wallet-outline" size={16} color={recordTracking === 'cash_ledger' ? colors.warning : colors.text.muted} />
                    <Text style={[styles.typeSelectorText, { color: recordTracking === 'cash_ledger' ? colors.warning : colors.text.secondary }]}>
                      Cash / Challan Ledger
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}

          <View style={styles.formSectionHeader}><Text style={styles.formSectionTitle}>General Profile</Text></View>

          {customerType === 'gst' ? (
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Company / Business Name *</Text>
              <View style={styles.formInput}>
                <Ionicons name="business" size={16} color={colors.text.muted} />
                <TextInput style={styles.formInputText} placeholder="e.g. Acme Corp Pvt Ltd" placeholderTextColor={colors.text.muted} value={company} onChangeText={setCompany} />
              </View>
            </View>
          ) : null}

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>{customerType === 'cash' ? 'Customer / Contact Name *' : 'Contact Person'}</Text>
            <View style={styles.formInput}>
              <Ionicons name="person" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="e.g. Clark Kent" placeholderTextColor={colors.text.muted} value={contactPerson} onChangeText={setContactPerson} />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Phone Number</Text>
            <View style={styles.formInput}>
              <Ionicons name="call" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="e.g. +91 9876543210" placeholderTextColor={colors.text.muted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Email Address (Optional)</Text>
            <View style={styles.formInput}>
              <Ionicons name="mail" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="e.g. billing@acme.com" placeholderTextColor={colors.text.muted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            </View>
          </View>

          <View style={[styles.formGroup, { zIndex: 1010 }]}>
            <Text style={styles.formLabel}>Payment Terms</Text>
            <View style={styles.formInput}>
              <Ionicons name="time" size={16} color={colors.text.muted} />
              {Platform.OS === 'web' ? React.createElement('select', {
                value: selectedDropdownTerm,
                onChange: (e: any) => handleDropdownTermChange(e.target.value),
                style: { flex: 1, padding: 8, fontSize: 14, border: 'none', outline: 'none', backgroundColor: 'transparent', color: colors.text.primary }
              }, [
                React.createElement('option', { value: 'Due on Receipt', key: 'receipt' }, 'Due on Receipt'),
                React.createElement('option', { value: 'Net 15', key: '15' }, 'Net 15 (15 Days)'),
                React.createElement('option', { value: 'Net 30', key: '30' }, 'Net 30 (30 Days)'),
                React.createElement('option', { value: 'Net 45', key: '45' }, 'Net 45 (45 Days)'),
                React.createElement('option', { value: 'Net 60', key: '60' }, 'Net 60 (60 Days)'),
                React.createElement('option', { value: 'Net 90', key: '90' }, 'Net 90 (90 Days)'),
                React.createElement('option', { value: 'Custom', key: 'custom' }, 'Custom...')
              ]) : (
                <>
                  <TouchableOpacity style={{ flex: 1, height: '100%', justifyContent: 'center' }} onPress={() => setShowTermsDropdown(!showTermsDropdown)}>
                    <Text style={{ color: selectedDropdownTerm ? colors.text.primary : colors.text.muted, fontSize: 14 }}>
                      {selectedDropdownTerm === 'Custom' ? 'Custom...' : (selectedDropdownTerm || 'Select Terms...')}
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
                    { val: 'Due on Receipt', label: 'Due on Receipt' },
                    { val: 'Net 15', label: 'Net 15 (15 Days)' },
                    { val: 'Net 30', label: 'Net 30 (30 Days)' },
                    { val: 'Net 45', label: 'Net 45 (45 Days)' },
                    { val: 'Net 60', label: 'Net 60 (60 Days)' },
                    { val: 'Net 90', label: 'Net 90 (90 Days)' },
                    { val: 'Custom', label: 'Custom...' },
                  ].map(t => (
                    <TouchableOpacity
                      key={t.val}
                      style={styles.customSelectItem}
                      onPress={() => {
                        handleDropdownTermChange(t.val);
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

          {selectedDropdownTerm === 'Custom' && (
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Custom Payment Terms</Text>
              <View style={styles.formInput}>
                <Ionicons name="create-outline" size={16} color={colors.text.muted} />
                <TextInput
                  style={styles.formInputText}
                  placeholder="e.g. Net 7 or 10 Days"
                  placeholderTextColor={colors.text.muted}
                  value={paymentTerms}
                  onChangeText={setPaymentTerms}
                />
              </View>
            </View>
          )}

          <View style={styles.formSectionHeader}><Text style={styles.formSectionTitle}>Billing Address (Lookup)</Text></View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Street Address</Text>
            <View style={styles.formInput}>
              <Ionicons name="home-outline" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="Shop/Office Number, Building, Area" placeholderTextColor={colors.text.muted} value={billingStreet} onChangeText={(val) => { setBillingStreet(val); if (shippingSameAsBilling) setShippingStreet(val); }} />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>PIN Code</Text>
            <View style={styles.formInput}>
              <Ionicons name="location" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="6-digit PIN code" placeholderTextColor={colors.text.muted} value={billingPin} onChangeText={handleBillingPinChange} keyboardType="numeric" maxLength={6} />
              {loadingBillingPin && <ActivityIndicator size="small" color={colors.primary} />}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>City (Auto-filled)</Text>
            <View style={styles.formInput}>
              <Ionicons name="map" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="City name" placeholderTextColor={colors.text.muted} value={billingCity} onChangeText={(val) => { setBillingCity(val); if (shippingSameAsBilling) setShippingCity(val); }} />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>State / UT (Auto-filled)</Text>
            <View style={styles.formInput}>
              <Ionicons name="map-outline" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="State name" placeholderTextColor={colors.text.muted} value={billingState} onChangeText={(val) => { setBillingState(val); if (shippingSameAsBilling) setShippingState(val); }} />
            </View>
          </View>

          <View style={styles.formSectionHeader}><Text style={styles.formSectionTitle}>Shipping Address</Text></View>

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 12, gap: 8 }}
            onPress={() => handleCheckboxChange(!shippingSameAsBilling)}
          >
            <Ionicons
              name={shippingSameAsBilling ? "checkbox" : "square-outline"}
              size={24}
              color={shippingSameAsBilling ? colors.primary : colors.text.muted}
            />
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }}>
              Shipping Address is same as Billing Address
            </Text>
          </TouchableOpacity>

          {!shippingSameAsBilling && (
            <View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Street Address</Text>
                <View style={styles.formInput}>
                  <Ionicons name="home-outline" size={16} color={colors.text.muted} />
                  <TextInput style={styles.formInputText} placeholder="Delivery address street details" placeholderTextColor={colors.text.muted} value={shippingStreet} onChangeText={setShippingStreet} />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>PIN Code</Text>
                <View style={styles.formInput}>
                  <Ionicons name="location" size={16} color={colors.text.muted} />
                  <TextInput style={styles.formInputText} placeholder="Shipping PIN Code" placeholderTextColor={colors.text.muted} value={shippingPin} onChangeText={handleShippingPinChange} keyboardType="numeric" maxLength={6} />
                  {loadingShippingPin && <ActivityIndicator size="small" color={colors.primary} />}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>City (Auto-filled)</Text>
                <View style={styles.formInput}>
                  <Ionicons name="map" size={16} color={colors.text.muted} />
                  <TextInput style={styles.formInputText} placeholder="City name" placeholderTextColor={colors.text.muted} value={shippingCity} onChangeText={setShippingCity} />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>State / UT (Auto-filled)</Text>
                <View style={styles.formInput}>
                  <Ionicons name="map-outline" size={16} color={colors.text.muted} />
                  <TextInput style={styles.formInputText} placeholder="State name" placeholderTextColor={colors.text.muted} value={shippingState} onChangeText={setShippingState} />
                </View>
              </View>
            </View>
          )}

          {customerType === 'gst' ? (
            <>
              <View style={styles.formSectionHeader}><Text style={styles.formSectionTitle}>Tax & Statutory Information</Text></View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>GSTIN</Text>
                <View style={styles.formInput}>
                  <Ionicons name="finger-print" size={16} color={colors.text.muted} />
                  <TextInput style={[styles.formInputText, { flex: 1 }]} placeholder="e.g. 27AAAAA1111A1Z1" placeholderTextColor={colors.text.muted} value={gstin} onChangeText={handleGstinChange} autoCapitalize="characters" />
                  {loadingGst ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
                  ) : (
                    <TouchableOpacity
                      onPress={handleAutoFillGst}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.primary + '15', borderRadius: 4, marginLeft: 8 }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Auto-Fill</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>PAN Card Number (Auto-extracted)</Text>
                <View style={styles.formInput}>
                  <Ionicons name="card" size={16} color={colors.text.muted} />
                  <TextInput style={styles.formInputText} placeholder="PAN details" placeholderTextColor={colors.text.muted} value={pan} onChangeText={setPan} autoCapitalize="characters" />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Place of Supply (GST State - Auto-extracted)</Text>
                <View style={styles.formInput}>
                  <Ionicons name="map" size={16} color={colors.text.muted} />
                  <TextInput style={styles.formInputText} placeholder="State place of supply" placeholderTextColor={colors.text.muted} value={placeOfSupply} onChangeText={setPlaceOfSupply} />
                </View>
              </View>
            </>
          ) : null}

          <View style={styles.formSectionHeader}><Text style={styles.formSectionTitle}>Balances & Volumes</Text></View>

          {customerType === 'gst' ? (
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Opening Invoice Balance (₹)</Text>
              <View style={styles.formInput}>
                <Ionicons name="cash" size={16} color={colors.text.muted} />
                <TextInput style={styles.formInputText} placeholder="0" placeholderTextColor={colors.text.muted} value={regularBalance} onChangeText={setRegularBalance} keyboardType="numeric" />
              </View>
            </View>
          ) : null}

          {canAccessCash ? (
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Opening Cash/Challan Balance (₹)</Text>
              <View style={styles.formInput}>
                <Ionicons name="wallet-outline" size={16} color={colors.text.muted} />
                <TextInput style={styles.formInputText} placeholder="0" placeholderTextColor={colors.text.muted} value={cashBalance} onChangeText={setCashBalance} keyboardType="numeric" />
              </View>
            </View>
          ) : null}



          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Initial Sales Volume (₹)</Text>
            <View style={styles.formInput}>
              <Ionicons name="cart" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="0" placeholderTextColor={colors.text.muted} value={salesVolume} onChangeText={setSalesVolume} keyboardType="numeric" />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// --- Customer Ledger Modal ---
function CustomerLedgerModal({
  customer, visible, onClose
}: { customer: Customer | null; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useStyles(createStyles);
  const canAccessCash = user?.canAccessCash ?? false;

  const [rows, setRows] = useState<any[]>([]);
  const [initialBalance, setInitialBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeLedgerMode, setActiveLedgerMode] = useState<'regular' | 'cash'>('regular');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = useCallback(async () => {
    if (!customer) return;
    setLoading(true);
    try {
      const name = customer.company || customer.name || '';
      const [allInvoices, allPayments, allMovements] = await Promise.all([
        api.getSaleInvoices(name),
        api.getPayments(customer._id, 'all', 'Customer'),
        api.getStockMovements({ search: name })
      ]);

      const filteredInvoices = activeLedgerMode === 'regular'
        ? allInvoices.filter(i => {
          if (!i.isFinalized) return false;
          const matchesName = (i.customerName || '').toLowerCase().includes(name.toLowerCase());
          return i.mode === 'regular' && matchesName;
        })
        : [];

      // Search may miss if partyName doesn't exactly match the search string, so include by exact ID as well
      const filteredPayments = allPayments.filter(p => {
        const matchesParty = ((p.partyName || '').toLowerCase().includes(name.toLowerCase()) || p.partyId === customer._id);
        return p.mode === activeLedgerMode && matchesParty;
      });

      const filteredMovements = allMovements.filter((m: any) => {
        const matchesParty = (m.partyName || '').toLowerCase().includes(name.toLowerCase());
        if (!matchesParty) return false;
        if (m.type !== 'sale' || m.status !== 'dispatched') return false;

        if (activeLedgerMode === 'regular') {
          return m.billingMode === 'regular' && !m.convertedToInvoice;
        } else {
          return m.billingMode === 'cash';
        }
      });

      type Row = { _id: string; date: string; no: string; mode: string; status: string; amount: number; isInvoice: boolean; isMovement?: boolean; dueDate?: string };
      let items: Row[] = [];

      filteredInvoices.forEach(inv => {
        items.push({
          _id: inv._id,
          date: inv.date,
          no: inv.invoiceNo,
          mode: inv.mode,
          status: inv.status,
          amount: inv.amount, // Customer owes us more
          isInvoice: true,
          dueDate: inv.dueDate
        });
      });

      filteredMovements.forEach(m => {
        items.push({
          _id: m._id,
          date: m.date,
          no: m.docNo,
          mode: m.billingMode || 'regular',
          status: m.status,
          amount: m.totalAmount || 0, // Customer owes us more
          isInvoice: false,
          isMovement: true
        });
      });

      filteredPayments.forEach(p => {
        items.push({
          _id: p._id,
          date: p.date,
          no: p.referenceNo || p.paymentMethod || 'Payment',
          mode: p.mode,
          status: p.type === 'receive' ? 'Received' : 'Refund',
          amount: p.type === 'receive' ? -p.amount : p.amount, // Receive decreases debt, Refund increases debt
          isInvoice: false
        });
      });

      // Sort by date ascending
      items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Compute Total Current Balance
      const currentTotalBalance = activeLedgerMode === 'regular' ? (customer.regularBalance || 0) : (customer.cashBalance || 0);

      // Calculate Initial Balance
      const totalAmountChange = items.reduce((sum, item) => sum + item.amount, 0);
      const startBalance = currentTotalBalance - totalAmountChange;

      // Compute running balances for all transactions
      let running = startBalance;
      const allRows = items.map(item => {
        running += item.amount;
        return { ...item, balance: running };
      });

      // Filter by date range
      let finalRows = allRows;
      let periodInitialBalance = startBalance;
      let periodClosingBalance = running;

      if (startDate) {
        const startTimestamp = new Date(startDate).getTime();
        finalRows = finalRows.filter(r => new Date(r.date).getTime() >= startTimestamp);
        const priorRows = allRows.filter(r => new Date(r.date).getTime() < startTimestamp);
        if (priorRows.length > 0) {
          periodInitialBalance = priorRows[priorRows.length - 1].balance;
        }
      }

      if (endDate) {
        const endTimestamp = new Date(endDate);
        endTimestamp.setHours(23, 59, 59, 999);
        finalRows = finalRows.filter(r => new Date(r.date).getTime() <= endTimestamp.getTime());
      }

      if (finalRows.length > 0) {
        periodClosingBalance = finalRows[finalRows.length - 1].balance;
      } else {
        periodClosingBalance = periodInitialBalance;
      }

      setRows([...finalRows].reverse());
      setInitialBalance(periodInitialBalance);
      setClosingBalance(periodClosingBalance);
    } catch (err) {
      console.error("Error loading customer ledger:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [customer, activeLedgerMode, startDate, endDate]);

  useEffect(() => {
    if (visible && customer) load();
  }, [visible, customer, load]);



  if (!customer) return null;

  const printLedger = () => {
    if (Platform.OS !== 'web') {
      alert('Print is available on web only.');
      return;
    }

    const fmt = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN')}`;
    const bDC = (n: number) => n > 0 ? 'DR' : n < 0 ? 'CR' : '';

    let periodStr = 'All Time';
    if (startDate && endDate) {
      periodStr = `From ${startDate} to ${endDate}`;
    } else if (startDate) {
      periodStr = `From ${startDate}`;
    } else if (endDate) {
      periodStr = `Up to ${endDate}`;
    }

    const tableRows = rows.map(r => {
      const d = new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const dr = r.amount > 0 ? fmt(r.amount) : '';
      const cr = r.amount < 0 ? fmt(-r.amount) : '';
      const balStr = `${bDC(r.balance)} ${fmt(r.balance)}`;

      return `
        <tr>
          <td>${d}</td>
          <td>${r.no}</td>
          <td>${r.mode === 'regular' ? 'GST' : 'Cash'}</td>
          <td style="color:${r.amount > 0 ? 'red' : 'green'}">${dr}</td>
          <td style="color:${r.amount < 0 ? 'green' : 'red'}">${cr}</td>
          <td><strong>${balStr}</strong></td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Statement - ${customer.company || customer.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; color: #333; }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; }
    .header h1 { font-size: 20px; margin-bottom: 5px; color: #000; }
    .header p { margin-bottom: 2px; }
    .details { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .details div { width: 48%; }
    h2 { font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px; color: #000; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f4f4f4; color: #000; }
    td:nth-child(4), td:nth-child(5), td:nth-child(6) { text-align: right; }
    th:nth-child(4), th:nth-child(5), th:nth-child(6) { text-align: right; }
    .summary-row { background-color: #f9f9f9; font-weight: bold; }
    @media print {
      body { width: 210mm; margin: 0 auto; padding: 0; }
      @page { size: A4; margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${FIRM_DETAILS.name}</h1>
    <p>${FIRM_DETAILS.address}</p>
    <p>Email: ${FIRM_DETAILS.email} | Phone: ${FIRM_DETAILS.phone}</p>
    <p><strong>GSTIN: ${FIRM_DETAILS.gstin}</strong></p>
  </div>
  
  <h2 style="text-align:center; border:none;">STATEMENT OF ACCOUNT</h2>
  
  <div class="details">
    <div>
      <strong>To:</strong><br/>
      ${customer.company || customer.name}<br/>
      ${customer.billingAddress?.city ? customer.billingAddress.city : ''} ${customer.state ? ', ' + customer.state : ''}<br/>
      ${customer.gstin ? `GSTIN: ${customer.gstin}` : 'UNREGISTERED'}
    </div>
    <div style="text-align:right;">
      <strong>Period:</strong><br/>
      ${periodStr}<br/><br/>
      <strong>Ledger Type:</strong><br/>
      ${activeLedgerMode === 'regular' ? 'Invoice (GST) Ledger' : 'Cash Ledger'}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 12%">Date</th>
        <th style="width: 30%">Ref No.</th>
        <th style="width: 10%">Mode</th>
        <th style="width: 16%">Debit (DR)</th>
        <th style="width: 16%">Credit (CR)</th>
        <th style="width: 16%">Balance</th>
      </tr>
    </thead>
    <tbody>
      <tr class="summary-row">
        <td colspan="3">Opening Balance</td>
        <td></td>
        <td></td>
        <td>${bDC(initialBalance)} ${fmt(initialBalance)}</td>
      </tr>
      ${tableRows}
      <tr class="summary-row" style="border-top: 2px solid #ccc;">
        <td colspan="3">Closing Balance</td>
        <td></td>
        <td></td>
        <td>${bDC(closingBalance)} ${fmt(closingBalance)}</td>
      </tr>
    </tbody>
  </table>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 250);
    }
  </script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=800,height=900');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  const drCrOf = (n: number) =>
    n > 0 ? { label: 'DR', color: colors.success } :
      n < 0 ? { label: 'CR', color: colors.danger } :
        { label: '', color: colors.text.muted };

  const fmt = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN')}`;
  const bal = drCrOf(closingBalance);
  const startBal = drCrOf(initialBalance);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.ledgerOverlay} onPress={onClose}>
        <Pressable style={styles.ledgerSheet} onPress={() => { }}>
          <View style={styles.ledgerHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ledgerTitle}>Customer Ledger</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary, marginTop: 2 }}>
                {customer.company || customer.name}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <TouchableOpacity onPress={() => setShowPaymentModal(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.success + '1A', paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.success }}>
                <Ionicons name="card-outline" size={16} color={colors.success} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.success }}>Receive</Text>
              </TouchableOpacity>
              {Platform.OS === 'web' && (
                <TouchableOpacity onPress={printLedger} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.bg.card, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border }}>
                  <Ionicons name="print-outline" size={16} color={colors.text.primary} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.primary }}>Print</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={colors.text.muted} />
              </TouchableOpacity>
            </View>
          </View>

          {canAccessCash && (
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary, paddingHorizontal: Spacing.lg }}>
              <TouchableOpacity
                onPress={() => setActiveLedgerMode('regular')}
                style={[
                  { paddingVertical: 12, marginRight: 24, borderBottomWidth: 2, borderBottomColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 },
                  activeLedgerMode === 'regular' && { borderColor: colors.primary, backgroundColor: colors.primary + '0a' }
                ]}
              >
                <Ionicons name="business" size={16} color={activeLedgerMode === 'regular' ? colors.primary : colors.text.muted} />
                <Text style={[{ fontSize: 13, fontWeight: '700', color: colors.text.muted }, activeLedgerMode === 'regular' && { color: colors.primary }]}>Invoice (GST) Ledger</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveLedgerMode('cash')}
                style={[
                  { paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 },
                  activeLedgerMode === 'cash' && { borderColor: colors.warning, backgroundColor: colors.warning + '0a' }
                ]}
              >
                <Ionicons name="cash" size={16} color={activeLedgerMode === 'cash' ? colors.warning : colors.text.muted} />
                <Text style={[{ fontSize: 13, fontWeight: '700', color: colors.text.muted }, activeLedgerMode === 'cash' && { color: colors.warning }]}>Cash Ledger</Text>
              </TouchableOpacity>
            </View>
          )}



          {/* Date Filter */}
          <View style={{ flexDirection: 'row', paddingHorizontal: Spacing.lg, paddingVertical: 10, gap: 10, backgroundColor: colors.bg.primary, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted, marginBottom: 4 }}>From Date</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderRadius: 6, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10 }}>
                <Ionicons name="calendar-outline" size={14} color={colors.text.muted} />
                {Platform.OS === 'web' ? React.createElement('input', {
                  type: 'date',
                  value: startDate,
                  onChange: (e: any) => setStartDate(e.target.value),
                  style: { flex: 1, padding: 8, fontSize: 12, border: 'none', outline: 'none', backgroundColor: 'transparent', color: colors.text.primary }
                }) : (
                  <TextInput style={{ flex: 1, height: 36, color: colors.text.primary, fontSize: 12, paddingLeft: 8 }} placeholder="YYYY-MM-DD" placeholderTextColor={colors.text.muted} value={startDate} onChangeText={setStartDate} />
                )}
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted, marginBottom: 4 }}>To Date</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderRadius: 6, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10 }}>
                <Ionicons name="calendar-outline" size={14} color={colors.text.muted} />
                {Platform.OS === 'web' ? React.createElement('input', {
                  type: 'date',
                  value: endDate,
                  onChange: (e: any) => setEndDate(e.target.value),
                  style: { flex: 1, padding: 8, fontSize: 12, border: 'none', outline: 'none', backgroundColor: 'transparent', color: colors.text.primary }
                }) : (
                  <TextInput style={{ flex: 1, height: 36, color: colors.text.primary, fontSize: 12, paddingLeft: 8 }} placeholder="YYYY-MM-DD" placeholderTextColor={colors.text.muted} value={endDate} onChangeText={setEndDate} />
                )}
              </View>
            </View>
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator>
            <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>
              <View style={styles.ledgerTable}>
                <View style={styles.ledgerHeaderRow}>
                  <Text style={[styles.ledgerHeaderCell, { width: 100 }]}>Date</Text>
                  <Text style={[styles.ledgerHeaderCell, { width: 160 }]}>Invoice / Ref #</Text>
                  <Text style={[styles.ledgerHeaderCell, { width: 80 }]}>Mode</Text>
                  <Text style={[styles.ledgerHeaderCell, { width: 80 }]}>Status</Text>
                  <Text style={[styles.ledgerHeaderCell, { width: 120, textAlign: 'right' }]}>Amount</Text>
                  <Text style={[styles.ledgerHeaderCell, { width: 130, textAlign: 'right' }]}>Balance</Text>
                </View>

                {rows.length > 0 && (
                  <View style={[styles.ledgerRow, { backgroundColor: colors.bg.secondary, borderBottomWidth: 2, borderBottomColor: colors.border }]}>
                    <Text style={[styles.ledgerCell, { width: 100 }]}></Text>
                    <Text style={[styles.ledgerCell, { width: 160, fontWeight: '800', color: colors.text.primary }]}>Closing Balance</Text>
                    <Text style={[styles.ledgerCell, { width: 80 }]}></Text>
                    <Text style={[styles.ledgerCell, { width: 80 }]}></Text>
                    <Text style={[styles.ledgerCell, { width: 120 }]}></Text>
                    <Text style={[styles.ledgerCell, { width: 130, textAlign: 'right', fontWeight: '800', fontSize: 14, color: bal.color }]}>
                      {bal.label} {fmt(closingBalance)}
                    </Text>
                  </View>
                )}

                {loading ? (
                  <View style={{ padding: 32, alignItems: 'center', width: 670 }}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={{ color: colors.text.muted, marginTop: 8, fontSize: 12 }}>Loading transactions…</Text>
                  </View>
                ) : rows.length === 0 ? (
                  <View style={{ padding: 32, alignItems: 'center', width: 670 }}>
                    <Ionicons name="receipt-outline" size={32} color={colors.text.muted} />
                    <Text style={{ color: colors.text.muted, marginTop: 8, fontSize: 12 }}>No transactions found for this customer</Text>
                  </View>
                ) : rows.map((row) => {
                  const d = new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
                  const bDC = drCrOf(row.balance);

                  let displayStatus = row.status;
                  let isOverdue = false;
                  if (row.isInvoice && row.status === 'unpaid') {
                    let due = row.dueDate ? new Date(row.dueDate) : null;
                    if (!due) {
                      const termsStr = customer.paymentTerms || 'Net 30';
                      const match = termsStr.match(/\d+/);
                      const termDays = match ? parseInt(match[0], 10) : 30;
                      due = new Date(new Date(row.date).getTime() + termDays * 24 * 60 * 60 * 1000);
                    }
                    due.setHours(0, 0, 0, 0);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    if (today.getTime() > due.getTime()) {
                      isOverdue = true;
                      const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
                      displayStatus = `Overdue (${diffDays}d)`;
                    }
                  }

                  return (
                    <View key={row._id} style={styles.ledgerRow}>
                      <Text style={[styles.ledgerCell, { width: 100, fontSize: 11 }]}>{d}</Text>
                      <Text style={[styles.ledgerCell, { width: 160, fontWeight: '600' }]} numberOfLines={1}>{row.no}</Text>
                      <View style={{ width: 80, paddingRight: 8, justifyContent: 'center' }}>
                        <Text style={[styles.modeBadge,
                        row.mode === 'regular'
                          ? { backgroundColor: colors.primary + '18', color: colors.primary }
                          : { backgroundColor: colors.warning + '18', color: colors.warning }]}>
                          {row.mode === 'regular' ? 'GST' : 'Cash'}
                        </Text>
                      </View>
                      <Text style={[styles.ledgerCell, {
                        width: 80, fontSize: 11, fontWeight: isOverdue ? 'bold' : 'normal',
                        color: (row.status === 'paid' || row.status === 'finalized' || row.status === 'Received') ? colors.success
                          : isOverdue ? colors.danger
                            : colors.text.muted
                      }]}>
                        {displayStatus}
                      </Text>
                      <Text style={[styles.ledgerCell, { width: 120, textAlign: 'right', fontWeight: '700', color: row.amount > 0 ? colors.success : colors.danger }]}>
                        {row.amount > 0 ? '+' : ''}{fmt(row.amount)}
                      </Text>
                      <Text style={[styles.ledgerCell, { width: 130, textAlign: 'right', fontWeight: '800', color: bDC.color }]}>
                        {bDC.label} {fmt(row.balance)}
                      </Text>
                    </View>
                  );
                })}

                <View style={[styles.ledgerRow, { backgroundColor: colors.bg.secondary, borderTopWidth: 2, borderTopColor: colors.border }]}>
                  <Text style={[styles.ledgerCell, { width: 100, color: colors.text.muted, fontSize: 11 }]}>Opening</Text>
                  <Text style={[styles.ledgerCell, { width: 160, color: colors.text.muted }]}>Opening Balance</Text>
                  <Text style={[styles.ledgerCell, { width: 80 }]}></Text>
                  <Text style={[styles.ledgerCell, { width: 80 }]}></Text>
                  <Text style={[styles.ledgerCell, { width: 120 }]}></Text>
                  <Text style={[styles.ledgerCell, { width: 130, textAlign: 'right', fontWeight: '800', color: startBal.color }]}>
                    {startBal.label} {fmt(initialBalance)}
                  </Text>
                </View>
              </View>
            </ScrollView>
          </ScrollView>

          <View style={styles.ledgerFooter}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={{ color: colors.text.secondary, fontWeight: '700', fontSize: 14 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>

      <AddPaymentModal
        visible={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSaved={() => {
          setShowPaymentModal(false);
          load();
        }}
        initialType="receive"
        fixedPartyId={customer._id}
        fixedPartyName={customer.company || customer.name}
      />
    </Modal>
  );
}

export default function CustomersScreen() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'gst' | 'cash'>('gst');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [ledgerVisible, setLedgerVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useStyles(createStyles);
  const canAccessCash = user?.canAccessCash ?? false;
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;

  const load = useCallback(async () => {
    const res = await api.getCustomers(search);
    setCustomers(res);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!canAccessCash && activeTab !== 'gst') {
      setActiveTab('gst');
    }
  }, [canAccessCash, activeTab]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filteredCustomers = customers.filter(c => {
    const hasGstin = !!(c.gstin && c.gstin.trim());
    return activeTab === 'gst' ? hasGstin : !hasGstin;
  }).sort((a, b) => (a.company || a.name || '').localeCompare(b.company || b.name || ''));

  return (
    <View style={styles.screen}>
      <View style={styles.innerContainer}>
        <View style={{ zIndex: 1100, position: 'relative' }}>
          <View style={[styles.searchBar, { paddingRight: 8, paddingLeft: 12 }]}>
            <Ionicons name="search" size={18} color={colors.text.muted} />
            <TextInput
              style={[styles.searchInput, { minWidth: 60 }]}
              placeholder={isDesktop ? "Search customers..." : "Search..."}
              placeholderTextColor={colors.text.muted}
              value={search}
              onChangeText={setSearch}
            />

            {/* Wrap filter button and dropdown panel in a local relative container to prevent mobile clipping */}
            <View style={{ position: 'relative', zIndex: 1200 }}>
              <TouchableOpacity
                style={[styles.filterDropdownButton, { borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 4 }]}
                onPress={() => setShowFilterDropdown(!showFilterDropdown)}
              >
                <Ionicons name={activeTab === 'gst' ? "business" : "cash"} size={14} color={activeTab === 'gst' ? colors.primary : colors.warning} />
                <Text style={styles.filterDropdownButtonText}>
                  {activeTab === 'gst' ? (isDesktop ? 'GST Customers' : 'GST') : (isDesktop ? 'Cash / Unreg' : 'Cash')}
                </Text>
                <Ionicons name={showFilterDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.muted} />
              </TouchableOpacity>

              {showFilterDropdown && (
                <View style={[styles.filterDropdownPanel, { top: 40, right: 0, width: isDesktop ? 220 : 160 }]}>
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
                    <TouchableOpacity
                      style={[styles.filterDropdownItem, activeTab === 'gst' && { backgroundColor: colors.primary + '08' }]}
                      onPress={() => {
                        setActiveTab('gst');
                        setShowFilterDropdown(false);
                      }}
                    >
                      <Text style={[styles.filterDropdownItemText, activeTab === 'gst' && { fontWeight: '700', color: colors.primary }]}>
                        GST Customers
                      </Text>
                    </TouchableOpacity>
                    {canAccessCash && (
                      <TouchableOpacity
                        style={[styles.filterDropdownItem, activeTab === 'cash' && { backgroundColor: colors.primary + '08' }]}
                        onPress={() => {
                          setActiveTab('cash');
                          setShowFilterDropdown(false);
                        }}
                      >
                        <Text style={[styles.filterDropdownItemText, activeTab === 'cash' && { fontWeight: '700', color: colors.warning }]}>
                          Cash / Unregistered
                        </Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.addBtn} onPress={() => { setSelectedCust(null); setIsEditing(false); setAddVisible(true); }}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true}>
          <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: Spacing.lg }}>
            <View style={styles.table}>
              {/* Table Header Row */}
              <View style={styles.tableHeaderRow}>
                <View style={[styles.tableHeaderCellContainer, { width: 240 }]}><Text style={styles.tableHeaderCell}>Registered Name / Customer</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 150 }]}><Text style={styles.tableHeaderCell}>GSTIN</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 160 }]}><Text style={styles.tableHeaderCell}>Contact Person</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 140 }]}><Text style={styles.tableHeaderCell}>Phone</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 140 }]}><Text style={styles.tableHeaderCell}>City</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 140 }]}><Text style={[styles.tableHeaderCell, { textAlign: 'right' }]}>Balance</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 100, borderRightWidth: 0 }]}><Text style={[styles.tableHeaderCell, { textAlign: 'center' }]}>Action</Text></View>
              </View>

              {/* Table Body Rows */}
              {filteredCustomers.map((c) => {
                const isCash = !c.gstin || !c.gstin.trim();

                const bal = c.regularBalance;
                const drCrLabel = bal > 0 ? 'DR' : bal < 0 ? 'CR' : null;
                const balColor = bal > 0 ? colors.success : bal < 0 ? colors.danger : colors.text.muted;
                const balBg = bal > 0 ? colors.success + '12' : bal < 0 ? colors.danger + '12' : colors.bg.secondary;



                const billing = c.billingAddress || { city: '', state: '', street: '' };
                const compName = c.company || c.name || 'N/A';
                const avatar = getAvatarColor(compName, colors);

                return (
                  <Pressable
                    key={c._id}
                    style={({ pressed }) => [styles.tableBodyRow, pressed && { backgroundColor: colors.bg.secondary }]}
                    onPress={() => { setSelectedCust(c); setLedgerVisible(true); }}
                  >
                    {/* Registered/Company Name + Avatar */}
                    <View style={[styles.tableCellContainer, { width: 240, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                      <View style={[styles.avatarCircle, { backgroundColor: avatar.bg }]}>
                        <Text style={[styles.avatarCircleText, { color: avatar.text }]}>
                          {compName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.primaryText} numberOfLines={1}>
                          {compName}
                        </Text>
                        {c.name && c.company ? (
                          <Text style={styles.secondaryText} numberOfLines={1}>
                            {c.name}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    {/* GSTIN Pill Badge or Cash Tag */}
                    <View style={[styles.tableCellContainer, { width: 150 }]}>
                      {isCash ? (
                        <View style={[styles.gstinBadge, { backgroundColor: colors.warning + '0c', borderColor: colors.warning + '20' }]}>
                          <Ionicons name="cash" size={10} color={colors.warning} />
                          <Text style={[styles.gstinText, { color: colors.warning }]}>CASH ONLY</Text>
                        </View>
                      ) : c.gstin ? (
                        <View style={styles.gstinBadge}>
                          <Ionicons name="shield-checkmark" size={10} color={colors.primary} />
                          <Text style={styles.gstinText} numberOfLines={1}>{c.gstin}</Text>
                        </View>
                      ) : (
                        <Text style={styles.naText}>—</Text>
                      )}
                    </View>

                    {/* Contact Person */}
                    <View style={[styles.tableCellContainer, { width: 160, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                      <Ionicons name="person-outline" size={12} color={colors.text.muted} />
                      <Text style={{ fontSize: 13, color: colors.text.primary, fontWeight: '500' }} numberOfLines={1}>
                        {c.contactPerson || c.name || '—'}
                      </Text>
                    </View>

                    {/* Phone */}
                    <View style={[styles.tableCellContainer, { width: 140, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                      <Ionicons name="call-outline" size={12} color={colors.success} />
                      <Text style={styles.monoText} numberOfLines={1}>
                        {c.phone || '—'}
                      </Text>
                    </View>

                    {/* City */}
                    <View style={[styles.tableCellContainer, { width: 140, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                      <Ionicons name="location-outline" size={13} color={colors.danger} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: colors.text.primary, fontWeight: '500' }} numberOfLines={1}>
                          {billing.city || '—'}
                        </Text>
                        {c.state || billing.state ? (
                          <Text style={styles.secondaryText} numberOfLines={1}>{c.state || billing.state}</Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Dynamic Balance Badges based on selected recordTracking ledger */}
                    <View style={[styles.tableCellContainer, { width: 140, alignItems: 'flex-end', justifyContent: 'center' }]}>
                      {(() => {
                        const isCash = c.recordTracking === 'cash_ledger';
                        const amount = isCash ? (c.cashBalance || 0) : (c.regularBalance || 0);
                        const label = amount > 0 ? 'DR.' : amount < 0 ? 'CR.' : '';
                        const color = amount > 0 ? (isCash ? colors.warning : colors.success) : amount < 0 ? colors.danger : colors.text.muted;
                        const bg = amount > 0 ? (isCash ? colors.warning + '12' : colors.success + '12') : amount < 0 ? colors.danger + '12' : colors.bg.secondary;
                        return (
                          <View style={[styles.balanceBadge, { backgroundColor: bg, borderColor: color + '30', borderWidth: 1 }]}>
                            <Text style={[styles.balanceText, { color, fontSize: 13, fontWeight: '800' }]}>
                              {label} {Math.abs(amount).toLocaleString('en-IN')}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>

                    {/* Action */}
                    <View style={[styles.tableCellContainer, { width: 100, borderRightWidth: 0, alignItems: 'center', justifyContent: 'center' }]}>
                      <TouchableOpacity
                        style={styles.viewBtn}
                        onPress={(e) => { e.stopPropagation?.(); setSelectedCust(c); setDetailVisible(true); }}
                      >
                        <Ionicons name="eye-outline" size={13} color={colors.primary} />
                        <Text style={styles.viewBtnText}>View</Text>
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                );
              })}

              {filteredCustomers.length === 0 && (
                <View style={styles.emptyTableContainer}>
                  <Ionicons name="folder-open-outline" size={28} color={colors.text.muted} />
                  <Text style={styles.emptyText}>
                    No {activeTab === 'gst' ? 'GST' : 'Cash / Unregistered'} customers registered
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </ScrollView>
      </View>

      <CustomerDetailModal
        customer={selectedCust}
        visible={detailVisible}
        onClose={() => { setDetailVisible(false); load(); }}
        onDeleted={load}
        onEdit={() => {
          setDetailVisible(false);
          setIsEditing(true);
          setAddVisible(true);
        }}
      />

      <CustomerLedgerModal
        customer={selectedCust}
        visible={ledgerVisible}
        onClose={() => { setLedgerVisible(false); load(); }}
      />

      <AddEditCustomerModal
        visible={addVisible}
        onClose={() => { setAddVisible(false); setSelectedCust(null); setIsEditing(false); }}
        onSaved={load}
        customer={isEditing ? selectedCust : null}
      />
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  innerContainer: { flex: 1, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.card, margin: Spacing.lg, paddingHorizontal: 14, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, gap: 10 },
  searchInput: { flex: 1, height: 46, color: colors.text.primary, fontSize: 14 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.text.muted, textAlign: 'center', marginTop: 10, fontSize: 13 },

  table: { flex: 1, backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start', marginVertical: Spacing.md, overflow: 'hidden' },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  tableHeaderCell: { fontSize: 11, fontWeight: '800', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableHeaderCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  tableBodyRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  tableCell: { fontSize: 13, color: colors.text.primary },
  tableCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },

  // Avatar styles
  avatarCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarCircleText: { fontSize: 13, fontWeight: '800' },

  // GSTIN Pill Badge
  gstinBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '0a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.primary + '20', alignSelf: 'flex-start' },
  gstinText: { fontSize: 11, color: colors.primary, fontFamily: 'monospace', fontWeight: '600' },

  // Balance Pill Badge
  balanceBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.md },
  balanceBadgeLabel: { fontSize: 9, fontWeight: '900' },

  // Text styles
  primaryText: { fontSize: 13, fontWeight: '800', color: colors.text.primary },
  secondaryText: { fontSize: 10, color: colors.text.muted, marginTop: 1 },
  monoText: { fontSize: 12, color: colors.text.secondary, fontFamily: 'monospace' },
  naText: { fontSize: 12, color: colors.text.muted, fontStyle: 'italic' },
  balanceText: { fontSize: 14, fontWeight: '800' },

  // Action button
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  viewBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  emptyTableContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },

  // Modals
  modalContainer: { flex: 1, backgroundColor: colors.bg.primary, width: '100%', maxWidth: 650, alignSelf: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.text.primary },
  profileHeader: { alignItems: 'center', marginBottom: 20, marginTop: 10 },
  profileAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.purple + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  profileAvatarText: { fontSize: 28, fontWeight: '800', color: colors.purple },
  profileName: { fontSize: 22, fontWeight: '800', color: colors.text.primary },
  profileCompany: { fontSize: 14, color: colors.text.secondary },
  infoGrid: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.lg, gap: 14 },
  infoSectionHeader: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6, marginTop: 10, marginBottom: 4 },
  infoSectionTitle: { fontSize: 12, fontWeight: '800', color: colors.text.muted, textTransform: 'uppercase' },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { width: 22, textAlign: 'center' },
  infoLabel: { fontSize: 10, color: colors.text.muted, fontWeight: '600' },
  infoValue: { fontSize: 13, color: colors.text.primary, fontWeight: '600' },

  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: Radius.md, paddingVertical: 12, flex: 1 },
  editBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.danger, borderRadius: Radius.md, paddingVertical: 12, width: 120 },
  deleteBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  formSectionHeader: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6, marginTop: 20, marginBottom: 12 },
  formSectionTitle: { fontSize: 12, fontWeight: '800', color: colors.primary, textTransform: 'uppercase' },
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 12, fontWeight: '700', color: colors.text.secondary, marginBottom: 6 },
  formInput: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 },
  formInputText: { flex: 1, height: 46, color: colors.text.primary, fontSize: 14 },

  // Cash selector additions
  typeSelectorBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.card },
  typeSelectorText: { fontSize: 13, fontWeight: '700' },

  // Tab filter styles
  tabContainer: { flexDirection: 'row', gap: 10, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.card },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },

  // Dropdown filter styles
  filterDropdownButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, height: 36, gap: 6 },
  filterDropdownButtonText: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  filterDropdownPanel: { position: 'absolute', top: 52, right: 50, backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, width: 250, zIndex: 9999, boxShadow: '0px 6px 14px rgba(0,0,0,0.18)', elevation: 12 },
  filterDropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterDropdownItemActive: { backgroundColor: colors.primary + '08' },
  filterDropdownItemText: { fontSize: 13, color: colors.text.primary },

  // Ledger modal
  ledgerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' },
  ledgerSheet: { backgroundColor: colors.bg.primary, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '80%', borderTopWidth: 1, borderColor: colors.border, width: '100%' },
  ledgerHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  ledgerTitle: { fontSize: 18, fontWeight: '800', color: colors.text.primary },
  ledgerTable: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  ledgerHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 10, marginTop: 12 },
  ledgerHeaderCell: { fontSize: 11, fontWeight: '800', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, paddingRight: 8 },
  ledgerRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border + '80', paddingVertical: 10, alignItems: 'center' },
  ledgerCell: { fontSize: 13, color: colors.text.primary, paddingRight: 8 },
  modeBadge: { fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
  ledgerFooter: { padding: Spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg.secondary },
  closeBtn: { alignItems: 'center', padding: 12, borderRadius: Radius.md, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border },

  customSelectPanel: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: colors.bg.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 9999,
    boxShadow: '0px 4px 8px rgba(0,0,0,0.1)',
    elevation: 8
  },
  customSelectItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  customSelectItemText: {
    fontSize: 14,
    color: colors.text.primary
  },
});
