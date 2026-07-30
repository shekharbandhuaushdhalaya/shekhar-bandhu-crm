import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Pressable, StyleSheet, RefreshControl, Modal, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors } from '../../constants/theme';
import { api, Vendor, Invoice } from '../../utils/api';
import { useAuth } from '../../utils/auth';
import { usePermission } from '../../utils/permissions';
import { useTheme, useStyles } from '../../utils/themeContext';

import { FIRM_DETAILS } from '../../constants/firm';
import { AddPaymentModal } from '../payments';
import { validateGstinWithState, formatPhoneWithCountryCode, toTitleCase } from '../../utils/gst';

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

function VendorDetailModal({ vendor, visible, onClose, onDeleted, onEdit }: { vendor: Vendor | null; visible: boolean; onClose: () => void; onDeleted: () => void; onEdit: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuth();
  const perm = usePermission();
  const canAccessCash = user?.canAccessCash ?? false;

  if (!vendor) return null;

  const handleDelete = async () => {
    try {
      const success = await api.deleteVendor(vendor._id);
      if (success) {
        onDeleted();
        onClose();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete vendor');
    }
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Vendor Details</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          <View style={styles.profileHeader}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>{(vendor.displayName || vendor.name || 'V').charAt(0)}</Text>
            </View>
            <Text style={styles.profileName}>{vendor.displayName || vendor.name || 'N/A'}</Text>
            <Text style={styles.profileCompany}>{vendor.registeredName || vendor.company || 'N/A'}</Text>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoSectionHeader}>
              <Text style={styles.infoSectionTitle}>General Profile</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="person" size={16} color={colors.primary} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>Contact Person</Text>
                <Text style={styles.infoValue}>{vendor.contactPerson || 'N/A'}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="call" size={16} color={colors.success} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>Phone Number</Text>
                <Text style={styles.infoValue}>{vendor.phone || 'N/A'}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="mail" size={16} color={colors.info} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{vendor.email || 'N/A'}</Text>
              </View>
            </View>

            <View style={styles.infoSectionHeader}>
              <Text style={styles.infoSectionTitle}>Tax & Statutory Information</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="finger-print" size={16} color={colors.primary} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>GSTIN</Text>
                <Text style={styles.infoValue}>{vendor.gstin || 'Not Provided'}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="card" size={16} color={colors.warning} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>PAN (Extracted)</Text>
                <Text style={styles.infoValue}>{vendor.pan || 'N/A'}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="ribbon" size={16} color={colors.primary} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>Manufacturing License (GMP)</Text>
                <Text style={styles.infoValue}>{(vendor as any).manufacturingLicenseNo || 'N/A'}</Text>
              </View>
            </View>
            {(vendor as any).manufacturingLicenseExpiry ? (
              <View style={styles.infoItem}>
                <Ionicons name="calendar" size={16} color={colors.danger} style={styles.infoIcon} />
                <View>
                  <Text style={styles.infoLabel}>License Expiry Date</Text>
                  <Text style={styles.infoValue}>{new Date((vendor as any).manufacturingLicenseExpiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.infoItem}>
              <Ionicons name="map" size={16} color={colors.info} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>State / UT (From PIN)</Text>
                <Text style={styles.infoValue}>{vendor.state || 'N/A'}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="location" size={16} color={colors.text.muted} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>City & PIN</Text>
                <Text style={styles.infoValue}>{vendor.addressCity ? `${vendor.addressCity} - ` : ''}{vendor.addressPin || 'N/A'}</Text>
              </View>
            </View>

            <View style={styles.infoSectionHeader}>
              <Text style={styles.infoSectionTitle}>Bank Settlement Details</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="business" size={16} color={colors.primary} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>Bank Account Number</Text>
                <Text style={styles.infoValue}>{vendor.bankAccountNumber || 'N/A'}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="ribbon" size={16} color={colors.success} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>IFSC Code</Text>
                <Text style={styles.infoValue}>{vendor.bankIfsc || 'N/A'}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="wallet" size={16} color={colors.info} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>Bank Name & Branch</Text>
                <Text style={styles.infoValue}>
                  {vendor.bankName ? `${vendor.bankName} (${vendor.bankBranch || 'N/A'})` : 'N/A'}
                </Text>
              </View>
            </View>

            <View style={styles.infoSectionHeader}>
              <Text style={styles.infoSectionTitle}>Outstanding Balances & Terms</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="cash" size={16} color={colors.success} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>Invoice Balance (GST) {(vendor as any).recordTracking !== 'cash_ledger' ? '⭐ (Active Ledger)' : ''}</Text>
                <Text style={[styles.infoValue, { color: vendor.regularBalance > 0 ? colors.success : colors.text.muted }]}>
                  ₹{vendor.regularBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </View>

            <View style={styles.infoItem}>
              <Ionicons name="wallet-outline" size={16} color={colors.warning} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>Challan Balance (Cash/No GST) {(vendor as any).recordTracking === 'cash_ledger' ? '⭐ (Active Ledger)' : ''}</Text>
                <Text style={[styles.infoValue, { color: (vendor.cashBalance || 0) > 0 ? colors.warning : colors.text.muted }]}>
                  ₹{(vendor.cashBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </View>

            <View style={styles.infoItem}>
              <Ionicons name="time" size={16} color={colors.primary} style={styles.infoIcon} />
              <View>
                <Text style={styles.infoLabel}>Payment Terms & Category</Text>
                <Text style={styles.infoValue}>{vendor.paymentTerms} | {vendor.productCategory}</Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 16 }}>
            <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={styles.editBtnText}>Edit Details</Text>
            </TouchableOpacity>
            {perm.can('vendor:delete') && (
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

function AddEditVendorModal({ visible, onClose, onSaved, vendor }: { visible: boolean; onClose: () => void; onSaved: () => void; vendor?: Vendor | null }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useStyles(createStyles);
  const canAccessCash = user?.canAccessCash ?? false;

  const [registeredName, setRegisteredName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('');
  const [regularBalance, setRegularBalance] = useState('');
  const [cashBalance, setCashBalance] = useState('');
  const [recordTracking, setRecordTracking] = useState<'invoice_ledger' | 'cash_ledger'>('invoice_ledger');

  const [terms, setTerms] = useState('Net 30');
  const [selectedDropdownTerm, setSelectedDropdownTerm] = useState('Net 30');
  const [showTermsDropdown, setShowTermsDropdown] = useState(false);
  
  const standardTerms = ['Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90'];

  const handleDropdownTermChange = (value: string) => {
    setSelectedDropdownTerm(value);
    if (value !== 'Custom') {
      setTerms(value);
    } else {
      if (standardTerms.includes(terms)) {
        setTerms('');
      }
    }
  };

  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [addressPin, setAddressPin] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [state, setState] = useState('Maharashtra');

  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [manufacturingLicenseNo, setManufacturingLicenseNo] = useState('');
  const [manufacturingLicenseExpiry, setManufacturingLicenseExpiry] = useState('');

  const [loadingPin, setLoadingPin] = useState(false);
  const [loadingIfsc, setLoadingIfsc] = useState(false);
  const [loadingGst, setLoadingGst] = useState(false);

  useEffect(() => {
    if (vendor) {
      setRegisteredName(vendor.company || vendor.registeredName || '');
      setDisplayName(vendor.name || vendor.displayName || '');
      setContactPerson(vendor.contactPerson || '');
      setPhone(vendor.phone || '');
      setEmail(vendor.email || '');
      setCategory(vendor.productCategory || '');
      setRegularBalance(vendor.regularBalance.toString());
      setCashBalance(vendor.cashBalance ? vendor.cashBalance.toString() : '0');
      setRecordTracking((vendor as any).recordTracking || 'invoice_ledger');

      
      const currentTerms = vendor.paymentTerms || 'Net 30';
      setTerms(currentTerms);
      if (standardTerms.includes(currentTerms)) {
        setSelectedDropdownTerm(currentTerms);
      } else {
        setSelectedDropdownTerm('Custom');
      }
      
      setGstin(vendor.gstin || '');
      setPan(vendor.pan || '');
      setAddressPin(vendor.addressPin || '');
      setAddressCity(vendor.addressCity || '');
      setState(vendor.state || 'Maharashtra');
      setBankAccountNumber(vendor.bankAccountNumber || '');
      setBankIfsc(vendor.bankIfsc || '');
      setBankName(vendor.bankName || '');
      setBankBranch(vendor.bankBranch || '');
      setManufacturingLicenseNo((vendor as any).manufacturingLicenseNo || '');
      setManufacturingLicenseExpiry((vendor as any).manufacturingLicenseExpiry ? new Date((vendor as any).manufacturingLicenseExpiry).toISOString().slice(0, 10) : '');
    } else {
      setRegisteredName('');
      setDisplayName('');
      setContactPerson('');
      setPhone('');
      setEmail('');
      setCategory('');
      setRegularBalance('');
      setCashBalance('');
      setRecordTracking('invoice_ledger');

      setTerms('Net 30');
      setSelectedDropdownTerm('Net 30');
      setShowTermsDropdown(false);
      setGstin('');
      setPan('');
      setAddressPin('');
      setAddressCity('');
      setState('Maharashtra');
      setBankAccountNumber('');
      setBankIfsc('');
      setBankName('');
      setBankBranch('');
      setManufacturingLicenseNo('');
      setManufacturingLicenseExpiry('');
    }
  }, [vendor, visible]);

  // GSTIN changes -> Auto extract PAN
  const handleGstinChange = (val: string) => {
    setGstin(val);
    const cleaned = val.trim().toUpperCase();
    if (cleaned.length >= 12) {
      const panPart = cleaned.substring(2, 12);
      if (/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panPart)) {
        setPan(panPart);
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
      setRegisteredName(data.companyName);
      setDisplayName(data.companyName.split('(')[0].trim());
      setAddressCity(data.billingAddress.split(',')[3]?.trim() || 'Varanasi');
      setState(data.state);
      
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

  // PIN changes -> Auto fetch state/city
  const handlePinChange = async (val: string) => {
    setAddressPin(val);
    if (val.length === 6 && /^\d+$/.test(val)) {
      setLoadingPin(true);
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${val}`);
        const data = await res.json();
        if (data && data[0] && data[0].Status === 'Success') {
          const postOffice = data[0].PostOffice[0];
          setAddressCity(postOffice.District || postOffice.Name || '');
          setState(postOffice.State || 'Maharashtra');
        }
      } catch (err) {
        console.log('PIN fetch error:', err);
      } finally {
        setLoadingPin(false);
      }
    }
  };

  // IFSC changes -> Auto fetch bank details
  const handleIfscChange = async (val: string) => {
    setBankIfsc(val);
    const cleaned = val.trim().toUpperCase();
    if (cleaned.length === 11) {
      setLoadingIfsc(true);
      try {
        const res = await fetch(`https://ifsc.razorpay.com/${cleaned}`);
        if (res.ok) {
          const data = await res.json();
          setBankName(data.BANK || '');
          setBankBranch(data.BRANCH || '');
        }
      } catch (err) {
        console.log('IFSC fetch error:', err);
      } finally {
        setLoadingIfsc(false);
      }
    }
  };

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const finalName = displayName.trim() || registeredName.trim();
    if (!finalName) return;

    if (gstin.trim()) {
      const gstCheck = validateGstinWithState(gstin.trim(), state);
      if (!gstCheck.valid) {
        alert(gstCheck.error);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        name: finalName,
        company: registeredName.trim() || displayName.trim(),
        registeredName: registeredName.trim(),
        displayName: displayName.trim(),
        contactPerson: contactPerson.trim(),
        phone: phone.trim(),
        email: email.trim(),
        productCategory: category || 'General',
        regularBalance: parseInt(regularBalance) || 0,
        cashBalance: parseInt(cashBalance) || 0,
        recordTracking,

        paymentTerms: terms,
        gstin: gstin.trim(),
        pan: pan.trim(),
        addressPin: addressPin.trim(),
        addressCity: addressCity.trim(),
        state,
        bankAccountNumber: bankAccountNumber.trim(),
        bankIfsc: bankIfsc.trim().toUpperCase(),
        bankName: bankName.trim(),
        bankBranch: bankBranch.trim(),
        manufacturingLicenseNo: manufacturingLicenseNo.trim(),
        manufacturingLicenseExpiry: manufacturingLicenseExpiry ? new Date(manufacturingLicenseExpiry) : null
      };

      if (vendor) {
        await api.updateVendor(vendor._id, payload);
      } else {
        await api.createVendor(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to save vendor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} disabled={saving}>
            <Ionicons name="close" size={26} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{vendor ? 'Edit Vendor' : 'New Vendor'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.success} />
            ) : (
              <Ionicons name="checkmark-circle" size={26} color={colors.success} />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          <View style={styles.formSectionHeader}><Text style={styles.formSectionTitle}>General Profiles</Text></View>
          
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Registered Business Name</Text>
            <View style={styles.formInput}>
              <Ionicons name="business" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="e.g. Queen Industries Pvt Ltd" placeholderTextColor={colors.text.muted} value={registeredName} onChangeText={setRegisteredName} />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Display Name</Text>
            <View style={styles.formInput}>
              <Ionicons name="person" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="e.g. Queen Industries" placeholderTextColor={colors.text.muted} value={displayName} onChangeText={setDisplayName} />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Contact Person</Text>
            <View style={styles.formInput}>
              <Ionicons name="people" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="e.g. Oliver Queen" placeholderTextColor={colors.text.muted} value={contactPerson} onChangeText={setContactPerson} />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Phone Number</Text>
            <View style={styles.formInput}>
              <Ionicons name="call" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="e.g. +91 9999999999" placeholderTextColor={colors.text.muted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Email Address</Text>
            <View style={styles.formInput}>
              <Ionicons name="mail" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="e.g. billing@queen.com" placeholderTextColor={colors.text.muted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            </View>
          </View>

          <View style={styles.formSectionHeader}><Text style={styles.formSectionTitle}>Address Details (Lookup)</Text></View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>PIN Code (6 Digits)</Text>
            <View style={styles.formInput}>
              <Ionicons name="location" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="e.g. 400001" placeholderTextColor={colors.text.muted} value={addressPin} onChangeText={handlePinChange} keyboardType="numeric" maxLength={6} />
              {loadingPin && <ActivityIndicator size="small" color={colors.primary} />}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>City (Auto-filled)</Text>
            <View style={styles.formInput}>
              <Ionicons name="map" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="City name" placeholderTextColor={colors.text.muted} value={addressCity} onChangeText={setAddressCity} />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>State / UT (Auto-filled)</Text>
            <View style={styles.formInput}>
              <Ionicons name="map-outline" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="State name" placeholderTextColor={colors.text.muted} value={state} onChangeText={setState} />
            </View>
          </View>

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
            <Text style={styles.formLabel}>Manufacturing License Number (Job Work GMP)</Text>
            <View style={styles.formInput}>
              <Ionicons name="ribbon-outline" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="e.g. AYUSH-GMP-2026/09" placeholderTextColor={colors.text.muted} value={manufacturingLicenseNo} onChangeText={setManufacturingLicenseNo} autoCapitalize="characters" />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>License Expiry Date (YYYY-MM-DD)</Text>
            <View style={styles.formInput}>
              <Ionicons name="calendar-outline" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="e.g. 2029-12-31" placeholderTextColor={colors.text.muted} value={manufacturingLicenseExpiry} onChangeText={setManufacturingLicenseExpiry} />
            </View>
          </View>

          <View style={styles.formSectionHeader}><Text style={styles.formSectionTitle}>Bank Settlement Details</Text></View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Bank Account Number</Text>
            <View style={styles.formInput}>
              <Ionicons name="business" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="e.g. 9199920192019" placeholderTextColor={colors.text.muted} value={bankAccountNumber} onChangeText={setBankAccountNumber} keyboardType="numeric" />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>IFSC Code</Text>
            <View style={styles.formInput}>
              <Ionicons name="barcode" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="e.g. SBIN0000300" placeholderTextColor={colors.text.muted} value={bankIfsc} onChangeText={handleIfscChange} autoCapitalize="characters" />
              {loadingIfsc && <ActivityIndicator size="small" color={colors.primary} />}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Bank Name (Auto-filled)</Text>
            <View style={styles.formInput}>
              <Ionicons name="wallet-outline" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="Bank Name" placeholderTextColor={colors.text.muted} value={bankName} onChangeText={setBankName} />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Bank Branch (Auto-filled)</Text>
            <View style={styles.formInput}>
              <Ionicons name="location-outline" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="Bank Branch" placeholderTextColor={colors.text.muted} value={bankBranch} onChangeText={setBankBranch} />
            </View>
          </View>

          <View style={styles.formSectionHeader}><Text style={styles.formSectionTitle}>Balances & Terms</Text></View>

          {canAccessCash && (
            <>
              <View style={styles.formLabel}><Text style={styles.formLabel}>Ledger Tracking Style</Text></View>
              <View style={[styles.formGroup, { flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 16 }]}>
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
            </>
          )}

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Opening Invoice Balance (GST) (₹)</Text>
            <View style={styles.formInput}>
              <Ionicons name="cash" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="0" placeholderTextColor={colors.text.muted} value={regularBalance} onChangeText={setRegularBalance} keyboardType="numeric" />
            </View>
          </View>

          {canAccessCash && (
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Opening Cash/Challan Balance (₹)</Text>
              <View style={styles.formInput}>
                <Ionicons name="wallet-outline" size={16} color={colors.text.muted} />
                <TextInput style={styles.formInputText} placeholder="0" placeholderTextColor={colors.text.muted} value={cashBalance} onChangeText={setCashBalance} keyboardType="numeric" />
              </View>
            </View>
          )}



          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Product Category</Text>
            <View style={styles.formInput}>
              <Ionicons name="cube" size={16} color={colors.text.muted} />
              <TextInput style={styles.formInputText} placeholder="e.g. Raw Materials" placeholderTextColor={colors.text.muted} value={category} onChangeText={setCategory} />
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
                  value={terms} 
                  onChangeText={setTerms} 
                />
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Vendor Ledger Modal ─────────────────────────────────────────────────────
function VendorLedgerModal({
  vendor, visible, onClose
}: { vendor: Vendor | null; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useStyles(createStyles);
  const canAccessCash = user?.canAccessCash ?? false;
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [initialBalance, setInitialBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [activeLedgerMode, setActiveLedgerMode] = useState<'regular' | 'cash'>('regular');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    if (visible && vendor) {
      setActiveLedgerMode((vendor as any).recordTracking === 'cash_ledger' ? 'cash' : 'regular');
    }
  }, [visible, vendor]);

  const load = useCallback(async () => {
    if (!vendor) return;
    setLoading(true);
    try {
      const name = vendor.displayName || vendor.name || vendor.company || '';
      
      const [allInvoices, allPayments] = await Promise.all([
        api.getPurchaseInvoices(name),
        api.getPayments(vendor._id, 'all', 'Vendor')
      ]);

      const filteredInvoices = allInvoices.filter(i => 
        i.isFinalized && (i.supplierName || '').toLowerCase().includes(name.toLowerCase()) && i.mode === activeLedgerMode
      );
      const filteredPayments = allPayments.filter(p => 
        ((p.partyName || '').toLowerCase().includes(name.toLowerCase()) || p.partyId === vendor._id) && p.mode === activeLedgerMode
      );

      type Row = { _id: string; date: string; no: string; mode: string; status: string; amount: number; isInvoice: boolean; dueDate?: string };
      let items: Row[] = [];
      
      filteredInvoices.forEach(inv => {
        items.push({
          _id: inv._id,
          date: inv.date,
          no: inv.invoiceNo,
          mode: inv.mode,
          status: inv.status,
          amount: inv.amount, // Bill increases our debt to vendor
          isInvoice: true,
          dueDate: inv.dueDate
        });
      });

      filteredPayments.forEach(p => {
        items.push({
          _id: p._id,
          date: p.date,
          no: p.referenceNo || p.paymentMethod || 'Payment',
          mode: p.mode,
          status: p.type === 'make' ? 'Paid' : 'Refund',
          amount: p.type === 'make' ? -p.amount : p.amount, // Making payment decreases debt, receiving refund increases debt
          isInvoice: false
        });
      });

      // Sort by date ascending
      items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Compute Total Current Balance
      const currentTotalBalance = activeLedgerMode === 'cash' ? (vendor.cashBalance || 0) : (vendor.regularBalance || 0);
      
      // Calculate Initial Balance
      const totalAmountChange = items.reduce((sum, item) => sum + item.amount, 0);
      const startBalance = currentTotalBalance - totalAmountChange;

      // Compute running balances
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
      console.error("Error loading vendor ledger:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [vendor, activeLedgerMode, startDate, endDate]);

  useEffect(() => {
    if (visible && vendor) load();
  }, [visible, vendor, load]);



  if (!vendor) return null;

  const printLedger = () => {
    if (Platform.OS !== 'web') {
      alert('Print is available on web only.');
      return;
    }

    const fmt = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN')}`;
    const bDC = (n: number) => n > 0 ? 'CR' : n < 0 ? 'DR' : '';

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
      const cr = r.amount > 0 ? fmt(r.amount) : '';
      const dr = r.amount < 0 ? fmt(-r.amount) : '';
      const balStr = `${bDC(r.balance)} ${fmt(r.balance)}`;
      
      return `
        <tr>
          <td>${d}</td>
          <td>${r.no}</td>
          <td>${r.mode === 'regular' ? 'GST' : 'Cash'}</td>
          <td style="color:${r.amount < 0 ? 'green' : 'red'}">${dr}</td>
          <td style="color:${r.amount > 0 ? 'red' : 'green'}">${cr}</td>
          <td><strong>${balStr}</strong></td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Statement - ${vendor.company || vendor.displayName || vendor.name}</title>
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
      ${vendor.company || vendor.displayName || vendor.name}<br/>
      ${vendor.addressCity ? vendor.addressCity : ''} ${vendor.state ? ', ' + vendor.state : ''}<br/>
      ${vendor.gstin ? `GSTIN: ${vendor.gstin}` : 'UNREGISTERED'}
    </div>
    <div style="text-align:right;">
      <strong>Period:</strong><br/>
      ${periodStr}<br/><br/>
      <strong>Ledger Type:</strong><br/>
      ${activeLedgerMode === 'cash' ? 'Cash/Challan Ledger' : 'Invoice (GST) Ledger'}
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

  // DR/CR helper — from our books, vendor account:
  //   positive balance = we owe vendor → CR (credit for vendor)
  //   negative balance = they owe us   → DR (debit for vendor)
  const drCrOf = (n: number) =>
    n > 0 ? { label: 'CR', color: colors.danger  } :
    n < 0 ? { label: 'DR', color: colors.success } :
            { label: '',   color: colors.text.muted };

  const fmt = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN')}`;
  const bal = drCrOf(closingBalance);
  const startBal = drCrOf(initialBalance);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.ledgerOverlay} onPress={onClose}>
        <Pressable style={styles.ledgerSheet} onPress={() => {}}>
          {/* Header */}
          <View style={styles.ledgerHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ledgerTitle}>Party Ledger</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary, marginTop: 2 }}>
                {vendor.company || vendor.displayName || vendor.name}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <TouchableOpacity onPress={() => setShowPaymentModal(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.danger + '1A', paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.danger }}>
                <Ionicons name="card-outline" size={16} color={colors.danger} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.danger }}>Make Pay</Text>
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
                {/* Column headers */}
                <View style={styles.ledgerHeaderRow}>
                  <Text style={[styles.ledgerHeaderCell, { width: 100 }]}>Date</Text>
                  <Text style={[styles.ledgerHeaderCell, { width: 160 }]}>Invoice / Ref #</Text>
                  <Text style={[styles.ledgerHeaderCell, { width: 80  }]}>Mode</Text>
                  <Text style={[styles.ledgerHeaderCell, { width: 80  }]}>Status</Text>
                  <Text style={[styles.ledgerHeaderCell, { width: 120, textAlign: 'right' }]}>Amount</Text>
                  <Text style={[styles.ledgerHeaderCell, { width: 130, textAlign: 'right' }]}>Balance</Text>
                </View>

                {/* Closing balance */}
                {rows.length > 0 && (
                  <View style={[styles.ledgerRow, { backgroundColor: colors.bg.secondary, borderBottomWidth: 2, borderBottomColor: colors.border }]}>
                    <Text style={[styles.ledgerCell, { width: 100 }]}></Text>
                    <Text style={[styles.ledgerCell, { width: 160, fontWeight: '800', color: colors.text.primary }]}>Closing Balance</Text>
                    <Text style={[styles.ledgerCell, { width: 80  }]}></Text>
                    <Text style={[styles.ledgerCell, { width: 80  }]}></Text>
                    <Text style={[styles.ledgerCell, { width: 120 }]}></Text>
                    <Text style={[styles.ledgerCell, { width: 130, textAlign: 'right', fontWeight: '800', fontSize: 14, color: bal.color }]}>
                      {bal.label} {fmt(closingBalance)}
                    </Text>
                  </View>
                )}

                {/* Invoice rows */}
                {loading ? (
                  <View style={{ padding: 32, alignItems: 'center', width: 670 }}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={{ color: colors.text.muted, marginTop: 8, fontSize: 12 }}>Loading transactions…</Text>
                  </View>
                ) : rows.length === 0 ? (
                  <View style={{ padding: 32, alignItems: 'center', width: 670 }}>
                    <Ionicons name="receipt-outline" size={32} color={colors.text.muted} />
                    <Text style={{ color: colors.text.muted, marginTop: 8, fontSize: 12 }}>No transactions found for this vendor</Text>
                  </View>
                ) : rows.map((row) => {
                  const d   = new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
                  const bDC = drCrOf(row.balance);
                  
                  let displayStatus = row.status;
                  let isOverdue = false;
                  if (row.isInvoice && row.status === 'pending') {
                    let due = row.dueDate ? new Date(row.dueDate) : null;
                    if (!due) {
                      const termsStr = vendor.paymentTerms || 'Net 30';
                      const match = termsStr.match(/\d+/);
                      const termDays = match ? parseInt(match[0], 10) : 30;
                      due = new Date(new Date(row.date).getTime() + termDays * 24 * 60 * 60 * 1000);
                    }
                    due.setHours(0,0,0,0);
                    const today = new Date();
                    today.setHours(0,0,0,0);
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
                      <View style={[{ width: 80, paddingRight: 8, justifyContent: 'center' }]}>
                        <Text style={[styles.modeBadge,
                          row.mode === 'regular'
                            ? { backgroundColor: colors.primary + '18', color: colors.primary }
                            : { backgroundColor: colors.warning + '18', color: colors.warning }]}>
                          {row.mode === 'regular' ? 'GST' : 'Cash'}
                        </Text>
                      </View>
                      <Text style={[styles.ledgerCell, { width: 80, fontSize: 11, fontWeight: isOverdue ? 'bold' : 'normal',
                        color: row.status === 'paid' ? colors.success
                             : isOverdue ? colors.danger
                             : row.status === 'Paid' ? colors.success
                             : colors.text.muted }]}>
                        {displayStatus}
                      </Text>
                      <Text style={[styles.ledgerCell, { width: 120, textAlign: 'right', fontWeight: '700', color: row.amount > 0 ? colors.danger : colors.success }]}>
                        {row.amount > 0 ? '+' : ''}{fmt(row.amount)}
                      </Text>
                      <Text style={[styles.ledgerCell, { width: 130, textAlign: 'right', fontWeight: '800', color: bDC.color }]}>
                        {bDC.label} {fmt(row.balance)}
                      </Text>
                    </View>
                  );
                })}

                {/* Opening balance */}
                <View style={[styles.ledgerRow, { backgroundColor: colors.bg.secondary, borderTopWidth: 2, borderTopColor: colors.border }]}>
                  <Text style={[styles.ledgerCell, { width: 100, color: colors.text.muted, fontSize: 11 }]}>Opening</Text>
                  <Text style={[styles.ledgerCell, { width: 160, color: colors.text.muted }]}>Opening Balance</Text>
                  <Text style={[styles.ledgerCell, { width: 80  }]}></Text>
                  <Text style={[styles.ledgerCell, { width: 80  }]}></Text>
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
        initialType="make"
        fixedPartyId={vendor._id}
        fixedPartyName={vendor.displayName || vendor.name || vendor.company}
      />
    </Modal>
  );
}

export default function VendorsScreen() {

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [search, setSearch]     = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVend, setSelectedVend] = useState<Vendor | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [ledgerVisible, setLedgerVisible] = useState(false);
  const [addVisible, setAddVisible]     = useState(false);
  const [isEditing, setIsEditing]       = useState(false);

  const { colors } = useTheme();
  const { user } = useAuth();
  const perm = usePermission();
  const styles = useStyles(createStyles);
  const canAccessCash = user?.canAccessCash ?? false;

  // Lazy loading state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 50;

  const load = useCallback(async () => {
    const res = await api.getVendors(search, page, limit);
    if (res && res.data) {
      if (page === 1) {
        setVendors(res.data);
      } else {
        setVendors(prev => {
          const existingIds = new Set(prev.map(v => v._id));
          const newVendors = res.data.filter((v: any) => !existingIds.has(v._id));
          return [...prev, ...newVendors];
        });
      }
      setTotalPages(res.totalPages || 1);
    } else {
      setVendors(Array.isArray(res) ? res : []);
      setTotalPages(1);
    }
  }, [search, page]);

  useEffect(() => { setPage(1); }, [search]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    api.clearCache();
    await load();
    setRefreshing(false);
  }, [load]);

  if (perm.permissions && !perm.can('vendor:view')) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg.primary, padding: 20 }}>
        <Ionicons name="lock-closed" size={48} color={colors.danger} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary, marginTop: 12 }}>Access Denied</Text>
        <Text style={{ fontSize: 13, color: colors.text.muted, marginTop: 4, textAlign: 'center' }}>You do not have permission to access vendor data.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.innerContainer}>
        <View style={[styles.searchBar, { paddingRight: 8, paddingLeft: 12 }]}>:
          <Ionicons name="search" size={18} color={colors.text.muted} />
          <TextInput
            style={[styles.searchInput, { minWidth: 100 }]}
            placeholder="Search vendors..."
            placeholderTextColor={colors.text.muted}
            value={search}
            onChangeText={setSearch}
          />
          <TouchableOpacity style={styles.addBtn} onPress={() => { setSelectedVend(null); setIsEditing(false); setAddVisible(true); }}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Tabular Layout Scroll Container */}
        <ScrollView 
          style={{ flex: 1 }} 
          showsVerticalScrollIndicator={true}
          scrollEventThrottle={400}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 50;
            if (isCloseToBottom && page < totalPages) {
              setPage(p => p + 1);
            }
          }}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: Spacing.lg }}>
          <View style={styles.table}>
            {/* Table Header */}
            <View style={styles.tableHeaderRow}>
              <View style={[styles.tableHeaderCellContainer, { width: 240 }]}><Text style={styles.tableHeaderCell}>Registered Name</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 160 }]}><Text style={styles.tableHeaderCell}>GSTIN</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 150 }]}><Text style={styles.tableHeaderCell}>Contact Person</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 150 }]}><Text style={styles.tableHeaderCell}>Contact No.</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 140 }]}><Text style={styles.tableHeaderCell}>City</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 140 }]}><Text style={[styles.tableHeaderCell, { textAlign: 'right' }]}>Balance</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 100, borderRightWidth: 0 }]}><Text style={[styles.tableHeaderCell, { textAlign: 'center' }]}>Action</Text></View>
            </View>

            {/* Table Body — each row is clickable for ledger */}
            {vendors.map((v) => {
              const bal = v.regularBalance;
              const drCrLabel = bal > 0 ? 'CR' : bal < 0 ? 'DR' : null;
              const balColor  = bal > 0 ? colors.danger : bal < 0 ? colors.success : colors.text.muted;
              const balBg = bal > 0 ? colors.danger + '12' : bal < 0 ? colors.success + '12' : colors.bg.secondary;

              const compName = toTitleCase(v.company || v.registeredName || v.name) || 'N/A';
              const subName = (v.displayName && v.displayName !== compName) ? toTitleCase(v.displayName) : (v.name && v.name !== compName) ? toTitleCase(v.name) : '';
              const avatar = getAvatarColor(compName, colors);
              const isUnregistered = !v.gstin || !v.gstin.trim();

              return (
                <Pressable
                  key={v._id}
                  style={({ pressed }) => [styles.tableBodyRow, pressed && { backgroundColor: colors.bg.secondary }]}
                  onPress={() => { setSelectedVend(v); setLedgerVisible(true); }}
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
                      {subName ? (
                        <Text style={styles.secondaryText} numberOfLines={1}>
                          {subName}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {/* GSTIN Pill Badge */}
                  <View style={[styles.tableCellContainer, { width: 160 }]}>
                    {isUnregistered ? (
                      <View style={[styles.gstinBadge, { backgroundColor: colors.warning + '0c', borderColor: colors.warning + '20' }]}>
                        <Ionicons name="cash" size={10} color={colors.warning} />
                        <Text style={[styles.gstinText, { color: colors.warning }]}>UNREGISTERED</Text>
                      </View>
                    ) : (
                      <View style={styles.gstinBadge}>
                        <Ionicons name="shield-checkmark" size={10} color={colors.primary} />
                        <Text style={styles.gstinText} numberOfLines={1}>{v.gstin}</Text>
                      </View>
                    )}
                  </View>

                  {/* Contact Person */}
                  <View style={[styles.tableCellContainer, { width: 150, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                    <Ionicons name="person-outline" size={12} color={colors.text.muted} />
                    <Text style={{ fontSize: 13, color: colors.text.primary, fontWeight: '500' }} numberOfLines={1}>
                      {toTitleCase(v.contactPerson) || '—'}
                    </Text>
                  </View>

                  {/* Contact No. */}
                  <View style={[styles.tableCellContainer, { width: 150, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                    <Ionicons name="call-outline" size={12} color={colors.success} />
                    <Text style={styles.monoText} numberOfLines={1}>
                      {formatPhoneWithCountryCode(v.phone)}
                    </Text>
                  </View>

                  {/* City + State */}
                  <View style={[styles.tableCellContainer, { width: 140, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                    <Ionicons name="location-outline" size={13} color={colors.danger} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, color: colors.text.primary, fontWeight: '500' }} numberOfLines={1}>
                        {toTitleCase(v.addressCity) || '—'}
                      </Text>
                      {v.state ? (
                        <Text style={styles.secondaryText} numberOfLines={1}>{toTitleCase(v.state)}</Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Dynamic Balance Badge based on recordTracking */}
                  <View style={[styles.tableCellContainer, { width: 140, alignItems: 'flex-end', justifyContent: 'center' }]}>
                    {(() => {
                      const isCash = (v as any).recordTracking === 'cash_ledger';
                      const amount = isCash ? (v.cashBalance || 0) : (v.regularBalance || 0);
                      
                      // For Vendors:
                      // positive balance means we owe them (Credit / CR)
                      // negative balance means they owe us (Debit / DR)
                      const label = amount > 0 ? 'CR.' : amount < 0 ? 'DR.' : '';
                      const color = amount > 0 ? colors.danger : amount < 0 ? colors.success : colors.text.muted;
                      const bg = amount > 0 ? colors.danger + '12' : amount < 0 ? colors.success + '12' : colors.bg.secondary;

                      return (
                        <View style={[styles.balanceBadge, { backgroundColor: bg, borderColor: color + '30', borderWidth: 1 }]}>
                          <Text style={[styles.balanceText, { color, fontSize: 13, fontWeight: '800' }]}>
                            {label} {Math.abs(amount).toLocaleString('en-IN')}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>

                  {/* Action: View Detail Button */}
                  <View style={[styles.tableCellContainer, { width: 100, borderRightWidth: 0, alignItems: 'center', justifyContent: 'center' }]}>
                    <TouchableOpacity
                      style={styles.viewBtn}
                      onPress={(e) => { e.stopPropagation?.(); setSelectedVend(v); setDetailVisible(true); }}
                    >
                      <Ionicons name="eye-outline" size={13} color={colors.primary} />
                      <Text style={styles.viewBtnText}>View</Text>
                    </TouchableOpacity>
                  </View>
                </Pressable>
              );
            })}

            {vendors.length === 0 && (
              <View style={styles.emptyTableContainer}>
                <Ionicons name="folder-open-outline" size={28} color={colors.text.muted} />
                <Text style={styles.emptyText}>No vendors registered</Text>
              </View>
            )}
          </View>
          </ScrollView>
          
          {page < totalPages && (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: colors.text.secondary, fontSize: 12 }}>Loading more...</Text>
            </View>
          )}
        </ScrollView>

      </View>

      <VendorLedgerModal
        vendor={selectedVend}
        visible={ledgerVisible}
        onClose={() => { setLedgerVisible(false); load(); }}
      />

      <VendorDetailModal 
        vendor={selectedVend} 
        visible={detailVisible} 
        onClose={() => { setDetailVisible(false); load(); }} 
        onDeleted={load} 
        onEdit={() => {
          setDetailVisible(false);
          setIsEditing(true);
          setAddVisible(true);
        }} 
      />

      <AddEditVendorModal 
        visible={addVisible} 
        onClose={() => { setAddVisible(false); setSelectedVend(null); setIsEditing(false); }} 
        onSaved={load} 
        vendor={isEditing ? selectedVend : null} 
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

  // Text styles
  primaryText: { fontSize: 13, fontWeight: '800', color: colors.text.primary },
  secondaryText: { fontSize: 10, color: colors.text.muted, marginTop: 1 },
  monoText: { fontSize: 12, color: colors.text.secondary, fontFamily: 'monospace' },
  naText: { fontSize: 12, color: colors.text.muted, fontStyle: 'italic' },
  balanceText: { fontSize: 14, fontWeight: '800' },

  // Action button (text + icon)
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

  typeSelectorBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.card },
  typeSelectorText: { fontSize: 13, fontWeight: '700' },

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
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.card },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },

  // Avatar styles
  avatarCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarCircleText: { fontSize: 13, fontWeight: '800' },

  // GSTIN Pill Badge
  gstinBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '0a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.primary + '20', alignSelf: 'flex-start' },
  gstinText: { fontSize: 11, color: colors.primary, fontFamily: 'monospace', fontWeight: '600' },

  // Balance Pill Badge
  balanceBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.md },
  balanceBadgeLabel: { fontSize: 9, fontWeight: '900' },

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

