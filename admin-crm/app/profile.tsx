import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  RefreshControl,
  Platform,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../utils/auth';
import { usePermission } from '../utils/permissions';
import { useTheme, useStyles } from '../utils/themeContext';
import { useToast } from '../utils/ToastContext';
import { api, getApiBaseUrl, setApiBaseUrl } from '../utils/api';
import { authStorage } from '../utils/storage';
import { updateActiveFirmDetails } from '../constants/firm';
import { Spacing, Radius, LightColors } from '../constants/theme';
import AyurvedicLoader from '../components/AyurvedicLoader';

export default function ProfileScreen() {
  const { user, updateUser } = useAuth();
  const perm = usePermission();
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { showToast } = useToast();
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;

  const [initialLoading, setInitialLoading] = useState(true);

  // Tab State for Admin & Profile
  const [activeTab, setActiveTab] = useState<'profile' | 'company' | 'units'>('profile');

  // Manufacturing Units state
  const [manufacturingUnits, setManufacturingUnits] = useState<any[]>([]);
  const [unitModalVisible, setUnitModalVisible] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitName, setUnitName] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [unitAddress, setUnitAddress] = useState('');
  const [unitCity, setUnitCity] = useState('');
  const [unitState, setUnitState] = useState('');
  const [unitPincode, setUnitPincode] = useState('');
  const [unitContact, setUnitContact] = useState('');
  const [unitPhone, setUnitPhone] = useState('');
  const [unitError, setUnitError] = useState('');
  const [savingUnit, setSavingUnit] = useState(false);

  const loadManufacturingUnits = async () => {
    try {
      const units = await api.getManufacturingUnits();
      setManufacturingUnits(units);
    } catch (_) { }
  };

  // Form states for profile details
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profileLoading, setProfileLoading] = useState(false);

  // Form state for API Base URL
  const [serverUrl, setServerUrl] = useState(getApiBaseUrl());

  // Form states for change password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: colors.text.muted };
    let score = 0;
    if (pass.length >= 6) score += 25;
    if (pass.length >= 10) score += 25;
    if (/[0-9]/.test(pass)) score += 25;
    if (/[^A-Za-z0-9]/.test(pass)) score += 25;

    if (score <= 25) return { score: 25, label: 'Weak', color: colors.danger };
    if (score <= 50) return { score: 50, label: 'Moderate', color: colors.warning };
    if (score <= 75) return { score: 75, label: 'Good', color: colors.primary };
    return { score: 100, label: 'Strong & Secure', color: colors.success };
  };

  const passStrength = getPasswordStrength(newPassword);
  const isMatching = confirmPassword.length > 0 && confirmPassword === newPassword;
  const isMismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;

  // Form states for Company Config (Admin Only)
  const [firmName, setFirmName] = useState('');
  const [firmAddress, setFirmAddress] = useState('');
  const [firmEmail, setFirmEmail] = useState('');
  const [firmPhone, setFirmPhone] = useState('');
  const [firmGstin, setFirmGstin] = useState('');

  const [bankName, setBankName] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [bankUpi, setBankUpi] = useState('');

  const [invoicePrefix, setInvoicePrefix] = useState('');
  const [quotationPrefix, setQuotationPrefix] = useState('');
  const [challanPrefix, setChallanPrefix] = useState('');
  const [dispatchPrefix, setDispatchPrefix] = useState('');

  const [defaultTerms, setDefaultTerms] = useState('');
  const [defaultGstRate, setDefaultGstRate] = useState('18');
  const [signatureBase64, setSignatureBase64] = useState('');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [signatureUploading, setSignatureUploading] = useState(false);
  const [qrImageBase64, setQrImageBase64] = useState('');
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [qrUploading, setQrUploading] = useState(false);
  const [dscSignatoryName, setDscSignatoryName] = useState('Authorised Representative');
  const [dscCertificateName, setDscCertificateName] = useState('eMudhra / Class 3 DSC');
  const [paymentGatewayEnabled, setPaymentGatewayEnabled] = useState(false);
  const [razorpayKeyId, setRazorpayKeyId] = useState('');
  const [razorpayKeySecret, setRazorpayKeySecret] = useState('');
  const [razorpayWebhookSecret, setRazorpayWebhookSecret] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [manufacturingLicenseNo, setManufacturingLicenseNo] = useState('');
  const [gmpCertificateNo, setGmpCertificateNo] = useState('');
  const [licenseValidTill, setLicenseValidTill] = useState('');
  const [gmpValidTill, setGmpValidTill] = useState('');
  const [companyLoading, setCompanyLoading] = useState(false);

  // User session states
  const [sessionInfo, setSessionInfo] = useState<{
    lastActive?: string;
    ipAddress?: string;
    deviceInfo?: string;
    createdAt?: string;
  }>({});
  const [refreshing, setRefreshing] = useState(false);

  // Load latest database session details
  const loadSessionDetails = async () => {
    try {
      const latestUser = await api.getMe();
      if (latestUser) {
        setSessionInfo({
          lastActive: latestUser.lastActive || new Date().toISOString(),
          ipAddress: latestUser.ipAddress || '127.0.0.1',
          deviceInfo: latestUser.deviceInfo || 'Web Dashboard',
          createdAt: latestUser.createdAt || new Date().toISOString()
        });
      }
    } catch (err) {
      setSessionInfo({
        lastActive: new Date().toISOString(),
        ipAddress: '127.0.0.1',
        deviceInfo: 'Web Browser',
        createdAt: new Date().toISOString()
      });
    }
  };

  // Load company config from DB
  const loadCompanyConfig = async () => {
    try {
      const config = await api.getSystemSettings();
      if (config) {
        setFirmName(config.firmName || '');
        setFirmAddress(config.firmAddress || '');
        setFirmEmail(config.firmEmail || '');
        setFirmPhone(config.firmPhone || '');
        setFirmGstin(config.firmGstin || '');
        setBankName(config.bankName || '');
        setBankAccountNo(config.bankAccountNo || '');
        setBankIfsc(config.bankIfsc || '');
        setBankBranch(config.bankBranch || '');
        setBankUpi(config.bankUpi || '');
        setInvoicePrefix(config.invoicePrefix || '');
        setQuotationPrefix(config.quotationPrefix || '');
        setChallanPrefix(config.challanPrefix || '');
        setDispatchPrefix(config.dispatchPrefix || '');
        setDefaultTerms(config.defaultTerms || '');
        setDefaultGstRate(config.defaultGstRate ? config.defaultGstRate.toString() : '18');
        setSignatureBase64(config.signatureBase64 || '');
        setSignatureUrl(config.signatureUrl || '');
        setQrImageBase64(config.qrImageBase64 || '');
        setQrImageUrl(config.qrImageUrl || '');
        setDscSignatoryName(config.dscSignatoryName || 'Authorised Representative');
        setDscCertificateName(config.dscCertificateName || 'eMudhra / Class 3 DSC');
        setPaymentGatewayEnabled(config.paymentGatewayEnabled || false);
        setRazorpayKeyId(config.razorpayKeyId || '');
        setRazorpayKeySecret(config.razorpayKeySecret || '');
        setRazorpayWebhookSecret(config.razorpayWebhookSecret || '');
        setGeminiApiKey(config.geminiApiKey || '');
        setManufacturingLicenseNo(config.manufacturingLicenseNo || '');
        setGmpCertificateNo(config.gmpCertificateNo || '');
        setLicenseValidTill(config.licenseValidTill ? config.licenseValidTill.split('T')[0] : '');
        setGmpValidTill(config.gmpValidTill ? config.gmpValidTill.split('T')[0] : '');

        // Instantly synchronize in-memory config on frontend
        updateActiveFirmDetails(config);
      }
    } catch (err) {
      console.error('Failed to load company configuration:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setInitialLoading(true);
      await Promise.all([loadSessionDetails(), loadCompanyConfig(), loadManufacturingUnits()]);
      setInitialLoading(false);
    };
    init();
  }, [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    api.clearCache();
    await loadSessionDetails();
    await loadCompanyConfig();
    await loadManufacturingUnits();
    setRefreshing(false);
  };

  const handleOpenAddUnit = () => {
    setEditingUnitId(null);
    setUnitName('');
    setUnitCode('');
    setUnitAddress('');
    setUnitCity('');
    setUnitState('');
    setUnitPincode('');
    setUnitContact('');
    setUnitPhone('');
    setUnitError('');
    setUnitModalVisible(true);
  };

  const handleOpenEditUnit = (unit: any) => {
    setEditingUnitId(unit._id);
    setUnitName(unit.name || '');
    setUnitCode(unit.code || '');
    setUnitAddress(unit.addressLine1 || '');
    setUnitCity(unit.city || '');
    setUnitState(unit.state || '');
    setUnitPincode(unit.pincode || '');
    setUnitContact(unit.contactPerson || '');
    setUnitPhone(unit.phone || '');
    setUnitError('');
    setUnitModalVisible(true);
  };

  const handleSaveUnit = async () => {
    if (!unitName.trim() || !unitCode.trim()) {
      setUnitError('Unit Name and Code are required.');
      return;
    }
    setSavingUnit(true);
    setUnitError('');
    try {
      const payload = {
        name: unitName.trim(),
        code: unitCode.trim().toUpperCase(),
        addressLine1: unitAddress.trim(),
        city: unitCity.trim(),
        state: unitState.trim(),
        pincode: unitPincode.trim(),
        contactPerson: unitContact.trim(),
        phone: unitPhone.trim()
      };

      if (editingUnitId) {
        await api.updateManufacturingUnit(editingUnitId, payload);
        showToast('Manufacturing Unit updated successfully!', 'success');
      } else {
        await api.createManufacturingUnit(payload);
        showToast('Manufacturing Unit created successfully!', 'success');
      }

      setEditingUnitId(null);
      setUnitName('');
      setUnitCode('');
      setUnitAddress('');
      setUnitCity('');
      setUnitState('');
      setUnitPincode('');
      setUnitContact('');
      setUnitPhone('');
      setUnitModalVisible(false);
      await loadManufacturingUnits();
    } catch (err: any) {
      setUnitError(err.message || 'Failed to save manufacturing unit');
    } finally {
      setSavingUnit(false);
    }
  };

  // Profile update handler
  const handleSaveProfile = async () => {
    if (!name.trim() || !email.trim()) {
      showToast('Name and Email are required.', 'warning');
      return;
    }
    setProfileLoading(true);
    try {
      const updatedUser = await api.updateProfile({
        name: name.trim(),
        email: email.trim().toLowerCase(),
      });
      await updateUser(updatedUser);
      showToast('Profile updated successfully!', 'success');
      loadSessionDetails();
    } catch (err: any) {
      showToast(err.message || 'Failed to update profile.', 'error');
    } finally {
      setProfileLoading(false);
    }
  };

  // Change password handler
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast('All password fields are required.', 'warning');
      return;
    }
    if (newPassword.length < 6) {
      showToast('New password must be at least 6 characters long.', 'warning');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match.', 'warning');
      return;
    }

    setPasswordLoading(true);
    try {
      await api.changePassword({
        currentPassword,
        newPassword
      });
      showToast('Password changed successfully!', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showToast(err.message || 'Failed to change password.', 'error');
    } finally {
      setPasswordLoading(false);
    }
  };

  // Server URL update handler
  const handleSaveServerUrl = async () => {
    if (!serverUrl.trim()) {
      showToast('Server URL cannot be empty.', 'warning');
      return;
    }
    try {
      await authStorage.setItem('vp_crm_api_url', serverUrl.trim());
      setApiBaseUrl(serverUrl.trim());
      showToast('Server connection URL saved!', 'success');
      loadSessionDetails();
    } catch (err: any) {
      showToast('Failed to save Server URL.', 'error');
    }
  };

  // Company Settings update handler (Admin Only)
  const handleSaveCompanyConfig = async () => {
    if (!firmName.trim()) {
      showToast('Firm name is required.', 'warning');
      return;
    }
    setCompanyLoading(true);
    try {
      const payload = {
        key: 'company_config',
        firmName: firmName.trim(),
        firmAddress: firmAddress.trim(),
        firmEmail: (firmEmail.trim() && firmEmail.includes('@')) ? firmEmail.trim() : 'info@shekharbandhuaushadhalaya.in',
        firmPhone: firmPhone.trim(),
        firmGstin: firmGstin.trim().toUpperCase(),
        bankName: bankName.trim(),
        bankAccountNo: bankAccountNo.trim(),
        bankIfsc: bankIfsc.trim().toUpperCase(),
        bankBranch: bankBranch.trim(),
        bankUpi: bankUpi.trim(),
        invoicePrefix: invoicePrefix.trim(),
        quotationPrefix: quotationPrefix.trim(),
        challanPrefix: challanPrefix.trim(),
        dispatchPrefix: dispatchPrefix.trim(),
        defaultTerms: defaultTerms.trim(),
        defaultGstRate: Number(defaultGstRate) || 18,
        signatureBase64,
        signatureUrl,
        qrImageBase64,
        qrImageUrl,
        dscSignatoryName: dscSignatoryName.trim(),
        dscCertificateName: dscCertificateName.trim(),
        paymentGatewayEnabled,
        razorpayKeyId: razorpayKeyId.trim(),
        razorpayKeySecret: razorpayKeySecret.trim(),
        razorpayWebhookSecret: razorpayWebhookSecret.trim(),
        geminiApiKey: geminiApiKey.trim(),
        manufacturingLicenseNo: manufacturingLicenseNo.trim(),
        gmpCertificateNo: gmpCertificateNo.trim(),
        licenseValidTill: licenseValidTill || null,
        gmpValidTill: gmpValidTill || null,
      };
      (payload as any).value = { ...payload };

      const updated = await api.updateSystemSettings(payload);

      // Update AsyncStorage cache for offline retrieval
      await authStorage.setItem('vp_crm_firm_settings', JSON.stringify(updated));

      // Update in-memory proxy
      updateActiveFirmDetails(updated);

      showToast('Company settings saved successfully!', 'success');
    } catch (err: any) {
      let errMsg = err.message || 'Failed to save company settings.';
      if (err.issues && Array.isArray(err.issues) && err.issues.length > 0) {
        errMsg = `Validation failed: ${err.issues.map((i: any) => `${i.path}: ${i.message}`).join(', ')}`;
      }
      showToast(errMsg, 'error');
    } finally {
      setCompanyLoading(false);
    }
  };

  const handleRevertCompanyConfig = async () => {
    try {
      setCompanyLoading(true);
      await loadCompanyConfig();
      showToast('Changes reverted to saved database settings.', 'info');
    } finally {
      setCompanyLoading(false);
    }
  };

  const roleColors: { [key: string]: string } = {
    admin: colors.danger,
    manager: colors.warning,
    agent: colors.success,
  };

  const formatTimestamp = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  const userInitials = user?.name ? user.name.split(' ').map(n => n.charAt(0)).join('').toUpperCase().slice(0, 2) : 'U';

  const renderForms = () => (
    <View style={styles.formContainer}>
      {/* Profile Details & Account Security Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="person-outline" size={18} color={colors.primary} />
          <Text style={styles.cardTitle}>Personal Details & Account Security</Text>
        </View>
        <View style={styles.cardContent}>
          {/* Row 1: Name and Email */}
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter full name"
                placeholderTextColor={colors.text.muted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Email Address (Account Login - Read Only)</Text>
              <TextInput
                style={[styles.input, { opacity: 0.7, backgroundColor: colors.bg.primary }]}
                value={email}
                editable={false}
                placeholder="Enter email address"
                placeholderTextColor={colors.text.muted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.btnPrimary, { marginTop: 4, marginBottom: 16 }]}
            onPress={handleSaveProfile}
            disabled={profileLoading}
            activeOpacity={0.8}
          >
            {profileLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                <Text style={styles.btnText}>Save Profile Details</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={[styles.divider, { marginVertical: 12 }]} />

          {/* Change Password Section inside Personal Details */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Ionicons name="key-outline" size={16} color={colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text.primary }}>Change Account Password</Text>
          </View>

          <Text style={styles.label}>Current Password</Text>
          <View style={{ position: 'relative', justifyContent: 'center' }}>
            <TextInput
              style={[styles.input, { paddingRight: 40 }]}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Enter current password"
              placeholderTextColor={colors.text.muted}
              secureTextEntry={!showCurrentPassword}
            />
            <TouchableOpacity
              style={{ position: 'absolute', right: 12, top: 0, bottom: 12, justifyContent: 'center' }}
              onPress={() => setShowCurrentPassword(!showCurrentPassword)}
            >
              <Ionicons name={showCurrentPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.text.muted} />
            </TouchableOpacity>
          </View>

          {/* New Password & Confirm New Password in SAME ROW */}
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>New Password</Text>
              <View style={{ position: 'relative', justifyContent: 'center' }}>
                <TextInput
                  style={[styles.input, { paddingRight: 40 }]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new password"
                  placeholderTextColor={colors.text.muted}
                  secureTextEntry={!showNewPassword}
                />
                <TouchableOpacity
                  style={{ position: 'absolute', right: 12, top: 0, bottom: 12, justifyContent: 'center' }}
                  onPress={() => setShowNewPassword(!showNewPassword)}
                >
                  <Ionicons name={showNewPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.text.muted} />
                </TouchableOpacity>
              </View>

              {/* Password Strength Indicator */}
              {newPassword.length > 0 && (
                <View style={{ marginTop: 6, gap: 4 }}>
                  <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' }}>
                    <View style={{ width: `${passStrength.score}%`, height: '100%', backgroundColor: passStrength.color }} />
                  </View>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: passStrength.color }}>
                    Strength: {passStrength.label}
                  </Text>
                </View>
              )}
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Confirm New Password</Text>
              <View style={{ position: 'relative', justifyContent: 'center' }}>
                <TextInput
                  style={[styles.input, { paddingRight: 40 }]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter new password"
                  placeholderTextColor={colors.text.muted}
                  secureTextEntry={!showConfirmPassword}
                />
                <TouchableOpacity
                  style={{ position: 'absolute', right: 12, top: 0, bottom: 12, justifyContent: 'center' }}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.text.muted} />
                </TouchableOpacity>
              </View>

              {/* Password Match Status Pill */}
              {confirmPassword.length > 0 && (
                <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons
                    name={isMatching ? "checkmark-circle" : "close-circle"}
                    size={14}
                    color={isMatching ? colors.success : colors.danger}
                  />
                  <Text style={{ fontSize: 10, fontWeight: '800', color: isMatching ? colors.success : colors.danger }}>
                    {isMatching ? '✔ Passwords Match' : '✖ Passwords do not match'}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.btnPrimary, { backgroundColor: colors.warning }]}
            onPress={handleChangePassword}
            disabled={passwordLoading}
            activeOpacity={0.8}
          >
            {passwordLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="lock-closed-outline" size={16} color="#fff" />
                <Text style={styles.btnText}>Update Password</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

    </View>
  );

  const canEdit = perm.can('settings:edit');

  const renderCompanySettings = () => (
    <View style={styles.formContainer}>
      {!canEdit && (
        <View style={{ backgroundColor: colors.warning + '20', padding: Spacing.md, borderRadius: Radius.sm, marginBottom: Spacing.md }}>
          <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '600' }}>
            Viewing company configuration. Only administrators can edit these settings.
          </Text>
        </View>
      )}

      {/* Firm details card */}
      <View style={[styles.card, !canEdit && { opacity: 0.85 }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="business-outline" size={18} color={colors.primary} />
          <Text style={styles.cardTitle}>Firm Details</Text>
        </View>
        <View style={[styles.cardContent, { pointerEvents: canEdit ? 'auto' : 'none' }]}>
          <Text style={styles.label}>Firm / Company Name</Text>
          <TextInput
            style={styles.input}
            value={firmName}
            onChangeText={setFirmName}
            placeholder="Enter firm name"
            placeholderTextColor={colors.text.muted}
          />

          <Text style={styles.label}>Address</Text>
          <TextInput
            style={[styles.input, { minHeight: 60 }]}
            value={firmAddress}
            onChangeText={setFirmAddress}
            placeholder="Enter billing address"
            placeholderTextColor={colors.text.muted}
            multiline
          />

          <View style={styles.rowInputs}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={styles.input}
                value={firmPhone}
                onChangeText={setFirmPhone}
                placeholder="Phone number"
                placeholderTextColor={colors.text.muted}
                keyboardType="phone-pad"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.label}>GSTIN / Tax ID</Text>
              <TextInput
                style={styles.input}
                value={firmGstin}
                onChangeText={setFirmGstin}
                placeholder="GSTIN number"
                placeholderTextColor={colors.text.muted}
                autoCapitalize="characters"
              />
            </View>
          </View>

          <Text style={styles.label}>Firm Email Address</Text>
          <TextInput
            style={styles.input}
            value={firmEmail}
            onChangeText={setFirmEmail}
            placeholder="Enter contact email"
            placeholderTextColor={colors.text.muted}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <View style={[styles.divider, { marginVertical: 8 }]} />

          {/* AYUSH Manufacturing License & GMP Section */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4 }}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text.primary }}>AYUSH Manufacturing License & GMP</Text>
          </View>

          <Text style={{ fontSize: 10, color: colors.text.muted, marginBottom: 10, lineHeight: 14 }}>
            Enter your AYUSH / State Drug Authority manufacturing license number and GMP certificate details. License format: e.g. "AYU/MFG/UP/12345" or as issued by your State Licensing Authority under Drugs & Cosmetics Act.
          </Text>

          <View style={styles.rowInputs}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Manufacturing License No. *</Text>
              <TextInput
                style={[styles.input, manufacturingLicenseNo.trim() && !/^[A-Z0-9\/\-\.\s]+$/i.test(manufacturingLicenseNo.trim()) ? { borderColor: colors.danger } : {}]}
                value={manufacturingLicenseNo}
                onChangeText={setManufacturingLicenseNo}
                placeholder="e.g. AYU/MFG/UP/12345"
                placeholderTextColor={colors.text.muted}
                autoCapitalize="characters"
              />
              {manufacturingLicenseNo.trim() && !/^[A-Z0-9\/\-\.\s]+$/i.test(manufacturingLicenseNo.trim()) ? (
                <Text style={{ fontSize: 9, color: colors.danger, marginTop: -8, marginBottom: 6 }}>⚠ Invalid format. Use alphanumeric with / - . only (as per AYUSH guidelines)</Text>
              ) : manufacturingLicenseNo.trim() ? (
                <Text style={{ fontSize: 9, color: colors.success, marginTop: -8, marginBottom: 6 }}>✓ Format looks valid</Text>
              ) : null}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.label}>License Valid Till</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={licenseValidTill}
                  onChange={(e: any) => setLicenseValidTill(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: `1px solid ${licenseValidTill && new Date(licenseValidTill) < new Date() ? colors.danger : colors.border}`,
                    backgroundColor: colors.bg.secondary,
                    color: colors.text.primary,
                    fontSize: 13,
                    height: 42,
                    width: '100%',
                    outline: 'none',
                    boxSizing: 'border-box',
                    marginBottom: 12,
                  } as any}
                />
              ) : (
                <TextInput
                  style={styles.input}
                  value={licenseValidTill}
                  onChangeText={setLicenseValidTill}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.text.muted}
                />
              )}
              {licenseValidTill && new Date(licenseValidTill) < new Date() ? (
                <Text style={{ fontSize: 9, color: colors.danger, marginTop: -8, marginBottom: 6 }}>⚠ License has EXPIRED! Renew immediately.</Text>
              ) : licenseValidTill ? (
                <Text style={{ fontSize: 9, color: colors.success, marginTop: -8, marginBottom: 6 }}>✓ Valid till {new Date(licenseValidTill).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.rowInputs}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>GMP Certificate No.</Text>
              <TextInput
                style={[styles.input, gmpCertificateNo.trim() && !/^[A-Z0-9\/\-\.\s]+$/i.test(gmpCertificateNo.trim()) ? { borderColor: colors.danger } : {}]}
                value={gmpCertificateNo}
                onChangeText={setGmpCertificateNo}
                placeholder="e.g. GMP/AYU/UP/2024/12345"
                placeholderTextColor={colors.text.muted}
                autoCapitalize="characters"
              />
              {gmpCertificateNo.trim() && !/^[A-Z0-9\/\-\.\s]+$/i.test(gmpCertificateNo.trim()) ? (
                <Text style={{ fontSize: 9, color: colors.danger, marginTop: -8, marginBottom: 6 }}>⚠ Invalid format. Use alphanumeric with / - . only</Text>
              ) : gmpCertificateNo.trim() ? (
                <Text style={{ fontSize: 9, color: colors.success, marginTop: -8, marginBottom: 6 }}>✓ Format looks valid</Text>
              ) : null}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.label}>GMP Valid Till</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={gmpValidTill}
                  onChange={(e: any) => setGmpValidTill(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: `1px solid ${gmpValidTill && new Date(gmpValidTill) < new Date() ? colors.danger : colors.border}`,
                    backgroundColor: colors.bg.secondary,
                    color: colors.text.primary,
                    fontSize: 13,
                    height: 42,
                    width: '100%',
                    outline: 'none',
                    boxSizing: 'border-box',
                    marginBottom: 12,
                  } as any}
                />
              ) : (
                <TextInput
                  style={styles.input}
                  value={gmpValidTill}
                  onChangeText={setGmpValidTill}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.text.muted}
                />
              )}
              {gmpValidTill && new Date(gmpValidTill) < new Date() ? (
                <Text style={{ fontSize: 9, color: colors.danger, marginTop: -8, marginBottom: 6 }}>⚠ GMP Certificate has EXPIRED! Renew immediately.</Text>
              ) : gmpValidTill ? (
                <Text style={{ fontSize: 9, color: colors.success, marginTop: -8, marginBottom: 6 }}>✓ Valid till {new Date(gmpValidTill).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
              ) : null}
            </View>
          </View>
        </View>
      </View>

      {/* Bank Details Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="card-outline" size={18} color={colors.primary} />
          <Text style={styles.cardTitle}>Bank Details</Text>
        </View>
        <View style={[styles.cardContent, { pointerEvents: canEdit ? 'auto' : 'none' }]}>
          <Text style={styles.label}>Bank Name</Text>
          <TextInput
            style={styles.input}
            value={bankName}
            onChangeText={setBankName}
            placeholder="e.g. State Bank of India"
            placeholderTextColor={colors.text.muted}
          />

          <View style={styles.rowInputs}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Account Number</Text>
              <TextInput
                style={styles.input}
                value={bankAccountNo}
                onChangeText={setBankAccountNo}
                placeholder="Account number"
                placeholderTextColor={colors.text.muted}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.label}>IFSC Code</Text>
              <TextInput
                style={styles.input}
                value={bankIfsc}
                onChangeText={setBankIfsc}
                placeholder="IFSC code"
                placeholderTextColor={colors.text.muted}
                autoCapitalize="characters"
              />
            </View>
          </View>

          <View style={styles.rowInputs}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Branch Name</Text>
              <TextInput
                style={styles.input}
                value={bankBranch}
                onChangeText={setBankBranch}
                placeholder="Branch details"
                placeholderTextColor={colors.text.muted}
              />
            </View>
          </View>

          <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: 'flex-end', gap: 12 }}>
            {/* UPI ID Input */}
            <View style={{ flex: 1, width: isDesktop ? 'auto' : '100%' }}>
              <Text style={styles.label}>UPI ID</Text>
              <TextInput
                style={[styles.input, { marginBottom: 0 }]}
                value={bankUpi}
                onChangeText={setBankUpi}
                placeholder="e.g. shopify@upi"
                placeholderTextColor={colors.text.muted}
                autoCapitalize="none"
              />
            </View>

            {/* QR Code Image Upload */}
            <View style={{ width: isDesktop ? 'auto' : '100%' }}>
              <Text style={styles.label}>QR Code Image</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: colors.primary + '12',
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: colors.primary,
                    borderRadius: Radius.md,
                    paddingHorizontal: 14,
                    height: 42,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                  onPress={() => {
                    if (Platform.OS === 'web') {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/png, image/jpeg, image/jpg';
                      input.onchange = (e: any) => {
                        const file = e.target.files[0];
                        if (file) {
                          setQrUploading(true);
                          const reader = new FileReader();
                          reader.onload = async (uploadEvent: any) => {
                            try {
                              const { url } = await api.uploadFile(uploadEvent.target.result, file.name);
                              setQrImageUrl(url);
                              setQrImageBase64('');
                              showToast('QR code image uploaded!', 'success');
                            } catch (err: any) {
                              showToast(err.message || 'QR image upload failed.', 'error');
                            } finally {
                              setQrUploading(false);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      };
                      input.click();
                    } else {
                      showToast('Please upload QR image on Web dashboard.', 'info');
                    }
                  }}
                >
                  {qrUploading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
                  )}
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                    {qrUploading ? 'Uploading...' : (qrImageUrl || qrImageBase64) ? 'Change QR Image' : 'Upload QR Image'}
                  </Text>
                </TouchableOpacity>

                {(qrImageUrl || qrImageBase64) ? (
                  <TouchableOpacity
                    style={{ padding: 6 }}
                    onPress={() => {
                      Alert.alert('Clear QR Image', 'Are you sure?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Clear', style: 'destructive', onPress: () => {
                          setQrImageBase64('');
                          setQrImageUrl('');
                          showToast('QR code cleared.', 'info');
                        }},
                      ]);
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          {(qrImageUrl || qrImageBase64) ? (
            <View style={{ marginTop: 12, padding: 10, backgroundColor: colors.bg.secondary, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: colors.text.muted, marginBottom: 6 }}>QR Preview on Delivery Challan:</Text>
              {Platform.OS === 'web' ? (
                <img src={qrImageUrl || qrImageBase64} style={{ maxHeight: 90, maxWidth: 90, objectFit: 'contain' }} />
              ) : (
                <Text style={{ fontSize: 11, color: colors.success, fontWeight: '700' }}>✔ QR code loaded</Text>
              )}
            </View>
          ) : null}
        </View>
      </View>

      {/* Payment Gateway (Razorpay) Card */}
      <View style={[styles.card, !canEdit && { opacity: 0.85 }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="card-outline" size={18} color={colors.primary} />
          <Text style={styles.cardTitle}>Payment Gateway Credentials (Razorpay)</Text>
        </View>
        <View style={[styles.cardContent, { pointerEvents: canEdit ? 'auto' : 'none' }]}>
          <View style={styles.switchRow}>
            <Text style={styles.label}>Enable Online Payments</Text>
            <TouchableOpacity
              style={[styles.toggleBtn, paymentGatewayEnabled && { backgroundColor: colors.success }]}
              onPress={() => setPaymentGatewayEnabled(!paymentGatewayEnabled)}
            >
              <Text style={{ color: paymentGatewayEnabled ? '#fff' : colors.text.secondary, fontSize: 12, fontWeight: '700' }}>
                {paymentGatewayEnabled ? 'ENABLED' : 'DISABLED'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 10, color: colors.text.muted, marginBottom: 12, lineHeight: 14 }}>
            Configure Razorpay keys to allow customers to pay invoices online.
          </Text>

          <Text style={styles.label}>Razorpay Key ID</Text>
          <TextInput
            style={styles.input}
            value={razorpayKeyId}
            onChangeText={setRazorpayKeyId}
            placeholder="e.g. rzp_live_xxxxxxxx"
            placeholderTextColor={colors.text.muted}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Razorpay Key Secret</Text>
          <TextInput
            style={styles.input}
            value={razorpayKeySecret}
            onChangeText={setRazorpayKeySecret}
            placeholder="Enter secret key"
            placeholderTextColor={colors.text.muted}
            autoCapitalize="none"
            secureTextEntry
          />

          <Text style={styles.label}>Webhook Secret (Optional)</Text>
          <TextInput
            style={styles.input}
            value={razorpayWebhookSecret}
            onChangeText={setRazorpayWebhookSecret}
            placeholder="For auto-confirming payments"
            placeholderTextColor={colors.text.muted}
            autoCapitalize="none"
            secureTextEntry
          />
        </View>
      </View>

      {/* Digital Signature & Authorised Seal Upload Card */}
      <View style={[styles.card, !canEdit && { opacity: 0.85 }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="document-text-outline" size={18} color={colors.success} />
          <Text style={styles.cardTitle}>Digital Signature & Authorised Seal Credentials</Text>
        </View>
        <View style={[styles.cardContent, { pointerEvents: canEdit ? 'auto' : 'none' }]}>
          <Text style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12 }}>
            Upload signature PNG image & set signatory designation for Rule 46 CGST & Section 5 IT Act 2000 legal compliance.
          </Text>

          <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: 'flex-end', gap: 12 }}>
            {/* Input 1: Signatory Name */}
            <View style={{ flex: 1, width: isDesktop ? 'auto' : '100%' }}>
              <Text style={styles.label}>Authorised Signatory / Designation</Text>
              <TextInput
                style={[styles.input, { marginBottom: 0 }]}
                value={dscSignatoryName}
                onChangeText={setDscSignatoryName}
                placeholder="e.g. Director / Authorised Rep"
                placeholderTextColor={colors.text.muted}
              />
            </View>

            {/* Input 2: Certifying Authority */}
            <View style={{ flex: 1, width: isDesktop ? 'auto' : '100%' }}>
              <Text style={styles.label}>Govt Certifying Authority / CA</Text>
              <TextInput
                style={[styles.input, { marginBottom: 0 }]}
                value={dscCertificateName}
                onChangeText={setDscCertificateName}
                placeholder="e.g. eMudhra Class 3 DSC"
                placeholderTextColor={colors.text.muted}
              />
            </View>

            {/* Input 3: Signature PNG Upload Button */}
            <View style={{ width: isDesktop ? 'auto' : '100%' }}>
              <Text style={styles.label}>Visual Signature PNG / Stamp</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: colors.primary + '12',
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: colors.primary,
                    borderRadius: Radius.md,
                    paddingHorizontal: 14,
                    height: 42,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                  onPress={() => {
                    if (Platform.OS === 'web') {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/png, image/jpeg, image/jpg';
                      input.onchange = (e: any) => {
                        const file = e.target.files[0];
                        if (file) {
                          setSignatureUploading(true);
                          const reader = new FileReader();
                          reader.onload = async (uploadEvent: any) => {
                            try {
                              const { url } = await api.uploadFile(uploadEvent.target.result, file.name);
                              setSignatureUrl(url);
                              setSignatureBase64('');
                              showToast('Signature uploaded!', 'success');
                            } catch (err: any) {
                              showToast(err.message || 'Signature upload failed.', 'error');
                            } finally {
                              setSignatureUploading(false);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      };
                      input.click();
                    } else {
                      showToast('Please upload signature image on Web dashboard.', 'info');
                    }
                  }}
                >
                  {signatureUploading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
                  )}
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                    {signatureUploading ? 'Uploading...' : (signatureUrl || signatureBase64) ? 'Change PNG' : 'Upload PNG'}
                  </Text>
                </TouchableOpacity>

                {(signatureUrl || signatureBase64) ? (
                  <TouchableOpacity
                    style={{ padding: 6 }}
                    onPress={() => {
                      Alert.alert('Clear Signature', 'Are you sure?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Clear', style: 'destructive', onPress: () => {
                          setSignatureBase64('');
                          setSignatureUrl('');
                          showToast('Signature cleared.', 'info');
                        }},
                      ]);
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          {(signatureUrl || signatureBase64) ? (
            <View style={{ marginTop: 12, padding: 10, backgroundColor: colors.bg.secondary, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: colors.text.muted, marginBottom: 6 }}>Signature Preview on Tax Documents:</Text>
              {Platform.OS === 'web' ? (
                <img src={signatureUrl || signatureBase64} style={{ maxHeight: 50, maxWidth: 200, objectFit: 'contain' }} />
              ) : (
                <Text style={{ fontSize: 11, color: colors.success, fontWeight: '700' }}>✔ Signature loaded</Text>
              )}
            </View>
          ) : null}
        </View>
      </View>

      {/* Bill Prefixes & Taxes Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="options-outline" size={18} color={colors.primary} />
          <Text style={styles.cardTitle}>Prefixes, Terms & Taxes</Text>
        </View>
        <View style={[styles.cardContent, { pointerEvents: canEdit ? 'auto' : 'none' }]}>
          <View style={styles.rowInputs}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Invoice Prefix</Text>
              <TextInput
                style={styles.input}
                value={invoicePrefix}
                onChangeText={setInvoicePrefix}
                placeholder="e.g. SB"
                placeholderTextColor={colors.text.muted}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.label}>Quotation Prefix</Text>
              <TextInput
                style={styles.input}
                value={quotationPrefix}
                onChangeText={setQuotationPrefix}
                placeholder="e.g. QT"
                placeholderTextColor={colors.text.muted}
              />
            </View>
          </View>

          <View style={styles.rowInputs}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Challan Prefix</Text>
              <TextInput
                style={styles.input}
                value={challanPrefix}
                onChangeText={setChallanPrefix}
                placeholder="e.g. CH"
                placeholderTextColor={colors.text.muted}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.label}>Default GST Slab (%)</Text>
              <TextInput
                style={styles.input}
                value={defaultGstRate}
                onChangeText={setDefaultGstRate}
                placeholder="e.g. 18"
                placeholderTextColor={colors.text.muted}
                keyboardType="numeric"
              />
            </View>
          </View>

          <Text style={styles.label}>Invoice Terms & Conditions</Text>
          <TextInput
            style={[styles.input, { minHeight: 100, fontSize: 12 }]}
            value={defaultTerms}
            onChangeText={setDefaultTerms}
            placeholder="Type default terms printed on documents..."
            placeholderTextColor={colors.text.muted}
            multiline
          />
        </View>
      </View>

      {/* App Server Settings Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="link-outline" size={18} color={colors.primary} />
          <Text style={styles.cardTitle}>App Server Settings</Text>
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.label}>Base API Server URL</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="e.g. http://192.168.1.100:5000/api"
              placeholderTextColor={colors.text.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.btnPrimary, { width: 'auto', paddingHorizontal: 16, height: 42, marginTop: 0 }]}
              onPress={handleSaveServerUrl}
              activeOpacity={0.8}
            >
              <Ionicons name="save-outline" size={16} color="#fff" />
              <Text style={styles.btnText}>Save Link</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Google Gemini AI Analytics Key Card */}
      <View style={[styles.card, !canEdit && { opacity: 0.85 }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="sparkles" size={18} color={colors.primary} />
          <Text style={styles.cardTitle}>Artificial Intelligence Credentials (Google Gemini 2.5)</Text>
        </View>
        <View style={[styles.cardContent, { pointerEvents: canEdit ? 'auto' : 'none' }]}>
          <Text style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12 }}>
            Configure your Google AI Studio API Key to power the natural language Business AI Assistant and executive CRM analytics.
          </Text>

          <Text style={styles.label}>Google Gemini API Key</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={geminiApiKey}
              onChangeText={setGeminiApiKey}
              placeholder="Paste your Gemini API Key (e.g. AIzaSy...)"
              placeholderTextColor={colors.text.muted}
              secureTextEntry
            />
            <TouchableOpacity
              style={[styles.btnPrimary, { width: 'auto', paddingHorizontal: 16, height: 42, marginTop: 0 }]}
              onPress={handleSaveCompanyConfig}
              disabled={companyLoading}
              activeOpacity={0.8}
            >
              {companyLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="key-outline" size={16} color="#fff" />
                  <Text style={styles.btnText}>Save Key</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 6 }}>
            Status: {geminiApiKey ? '✔ Key configured (Gemini 2.5 Flash Engine Enabled)' : '⚠️ Not configured'}
          </Text>
        </View>
      </View>

      {/* Save & Revert Action Buttons */}
      {canEdit && (
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          <TouchableOpacity
            style={[styles.btnPrimary, { flex: 1, backgroundColor: colors.success, marginTop: 0 }]}
            onPress={handleSaveCompanyConfig}
            disabled={companyLoading}
            activeOpacity={0.8}
          >
            {companyLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                <Text style={styles.btnText}>Update Global Settings</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              height: 42,
              paddingHorizontal: 16,
              borderRadius: Radius.md,
              backgroundColor: colors.bg.card,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
            onPress={handleRevertCompanyConfig}
            disabled={companyLoading}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh-outline" size={16} color={colors.text.secondary} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.secondary }}>Revert Changes</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderSidebar = () => (
    <View style={styles.sidebarContainer}>
      {/* Overview Card */}
      <View style={styles.card}>
        <View style={styles.overviewAvatarContainer}>
          <View style={[styles.avatar, { borderColor: roleColors[user?.role || 'agent'] }]}>
            <Text style={[styles.avatarText, { color: roleColors[user?.role || 'agent'] }]}>{userInitials}</Text>
          </View>
          <Text style={styles.overviewName}>{user?.name}</Text>
          <Text style={styles.overviewEmail}>{user?.email}</Text>

          <View style={[styles.badge, { borderColor: roleColors[user?.role || 'agent'], backgroundColor: roleColors[user?.role || 'agent'] + '12' }]}>
            <Text style={[styles.badgeText, { color: roleColors[user?.role || 'agent'] }]}>
              {user?.role?.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.permissionRow}>
          <Ionicons
            name={user?.canAccessCash ? 'cash-outline' : 'lock-closed-outline'}
            size={16}
            color={user?.canAccessCash ? colors.success : colors.text.muted}
          />
          <Text style={[styles.permissionText, user?.canAccessCash && { color: colors.success, fontWeight: '700' }]}>
            {user?.canAccessCash ? 'Cash Ledger Access Granted' : 'No Cash Ledger Access'}
          </Text>
        </View>
      </View>

      {/* Security details Session Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
          <Text style={styles.cardTitle}>Active Session Details</Text>
        </View>
        <View style={styles.cardContent}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Device / Platform</Text>
            <Text style={styles.metaValue}>{sessionInfo.deviceInfo || 'Unknown Device'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Active IP Address</Text>
            <Text style={styles.metaValue}>{sessionInfo.ipAddress || '—'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Last Session Action</Text>
            <Text style={styles.metaValue}>{formatTimestamp(sessionInfo.lastActive)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Member Since</Text>
            <Text style={styles.metaValue}>{formatTimestamp(sessionInfo.createdAt)}</Text>
          </View>
        </View>
      </View>

      {/* Admin Navigation */}
      {perm.can('audit:view') || perm.can('settings:edit') ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="settings-outline" size={18} color={colors.danger} />
            <Text style={[styles.cardTitle, { color: colors.danger }]}>Administration</Text>
          </View>
          <View style={styles.cardContent}>
            {perm.can('audit:view') && (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                onPress={() => router.push('/audit')}
                activeOpacity={0.7}
              >
                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.warning + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="shield-checkmark" size={16} color={colors.warning} />
                </View>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.text.primary }}>System Audit Logs</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}
              onPress={() => router.push('/rbac')}
              activeOpacity={0.7}
            >
              <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.danger + '18', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="people-outline" size={16} color={colors.danger} />
              </View>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.text.primary }}>Role-Based Access Control</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );

  const renderManufacturingUnits = () => (
    <View style={styles.formContainer}>
      <View style={[styles.card, { padding: 16 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="business-outline" size={20} color={colors.primary} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text.primary }}>Manufacturing Facilities & Units</Text>
          </View>
          {canEdit && (
            <TouchableOpacity
              style={[styles.btnPrimary, { width: 'auto', paddingHorizontal: 14, height: 38, marginTop: 0 }]}
              onPress={() => setUnitModalVisible(true)}
            >
              <Ionicons name="add-circle-outline" size={16} color="#fff" />
              <Text style={styles.btnText}>+ Define Unit</Text>
            </TouchableOpacity>
          )}
        </View>

        {manufacturingUnits.length > 0 ? (
          <View style={{ gap: 12 }}>
            {manufacturingUnits.map((unit: any) => (
              <View key={unit._id} style={{ backgroundColor: colors.bg.primary, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: colors.border, borderLeftColor: colors.primary, borderLeftWidth: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text.primary }}>{unit.name}</Text>
                    {unit.code ? (
                      <View style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: colors.primary }}>{unit.code}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ backgroundColor: colors.success + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.sm }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: colors.success }}>OPERATIONAL</Text>
                    </View>
                    {canEdit && (
                      <TouchableOpacity
                        style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm, backgroundColor: colors.primary + '15', flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        onPress={() => handleOpenEditUnit(unit)}
                      >
                        <Ionicons name="pencil" size={12} color={colors.primary} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Edit Unit</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted }}>LOCATION</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text.primary, marginTop: 2 }}>
                      {[unit.addressLine1, unit.city, unit.state, unit.pincode].filter(Boolean).join(', ') || 'No address specified'}
                    </Text>
                  </View>
                  {unit.contactPerson ? (
                    <View style={{ flex: 1, minWidth: 120 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted }}>CONTACT</Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text.primary, marginTop: 2 }}>
                        👤 {unit.contactPerson} {unit.phone ? `(${unit.phone})` : ''}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Ionicons name="business-outline" size={40} color={colors.text.muted} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.secondary, marginTop: 8 }}>No Manufacturing Units Configured</Text>
            {canEdit && (
              <TouchableOpacity
                style={[styles.btnPrimary, { width: 'auto', paddingHorizontal: 16, marginTop: 12 }]}
                onPress={() => setUnitModalVisible(true)}
              >
                <Text style={styles.btnText}>+ Define First Unit</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );

  const renderActiveTabContent = () => {
    if (activeTab === 'profile') return renderForms();
    if (activeTab === 'company') return renderCompanySettings();
    return renderManufacturingUnits();
  };

  if (initialLoading) {
    return <AyurvedicLoader />;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
    >
      {/* Tab Selectors with Visual Status Badges */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'profile' && styles.tabActiveButton]}
          onPress={() => setActiveTab('profile')}
          activeOpacity={0.7}
        >
          <Ionicons name="key-outline" size={16} color={activeTab === 'profile' ? colors.primary : colors.text.secondary} />
          <Text style={[styles.tabText, activeTab === 'profile' && styles.tabActiveText]}>My Credentials</Text>
          <View style={{ backgroundColor: colors.success + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginLeft: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.success }}>✔ Active Keys</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'company' && styles.tabActiveButton]}
          onPress={() => setActiveTab('company')}
          activeOpacity={0.7}
        >
          <Ionicons name="business-outline" size={16} color={activeTab === 'company' ? colors.primary : colors.text.secondary} />
          <Text style={[styles.tabText, activeTab === 'company' && styles.tabActiveText]}>Company Configuration</Text>
          <View style={{ backgroundColor: colors.primary + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginLeft: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.primary }}>✔ GST Verified</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'units' && styles.tabActiveButton]}
          onPress={() => setActiveTab('units')}
          activeOpacity={0.7}
        >
          <Ionicons name="hammer-outline" size={16} color={activeTab === 'units' ? colors.primary : colors.text.secondary} />
          <Text style={[styles.tabText, activeTab === 'units' && styles.tabActiveText]}>Manufacturing Facilities</Text>
          <View style={{ backgroundColor: colors.warning + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginLeft: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.warning }}>{manufacturingUnits.length} Units</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={[styles.layoutGrid, { flexDirection: isDesktop ? 'row' : 'column' }]}>
        {isDesktop ? (
          <>
            <View style={{ flex: 2, marginRight: Spacing.lg }}>
              {renderActiveTabContent()}
            </View>
            <View style={{ flex: 1 }}>{renderSidebar()}</View>
          </>
        ) : (
          <>
            {renderSidebar()}
            {renderActiveTabContent()}
          </>
        )}
      </View>

      {/* Modal: Define Manufacturing Unit */}
      {canEdit && (
        <Modal visible={unitModalVisible} transparent animationType="fade" onRequestClose={() => setUnitModalVisible(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
            <View style={{ backgroundColor: colors.bg.card, borderRadius: Radius.lg, width: '100%', maxWidth: 500, padding: 20, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text.primary }}>
                  {editingUnitId ? 'Edit Manufacturing Unit' : 'Define New Manufacturing Unit'}
                </Text>
                <TouchableOpacity onPress={() => setUnitModalVisible(false)}>
                  <Ionicons name="close" size={22} color={colors.text.primary} />
                </TouchableOpacity>
              </View>

              {unitError ? (
                <View style={{ backgroundColor: colors.danger + '15', padding: 10, borderRadius: Radius.sm, marginBottom: 12 }}>
                  <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '700' }}>{unitError}</Text>
                </View>
              ) : null}

              <ScrollView style={{ maxHeight: 400 }}>
                <Text style={styles.label}>Unit Name *</Text>
                <TextInput style={styles.input} placeholder="e.g. Varanasi Main Factory" placeholderTextColor={colors.text.muted} value={unitName} onChangeText={setUnitName} />

                <Text style={styles.label}>Unit Code / Abbreviation *</Text>
                <TextInput style={styles.input} placeholder="e.g. MFG-VARANASI" placeholderTextColor={colors.text.muted} value={unitCode} onChangeText={setUnitCode} />

                <Text style={styles.label}>Address Line 1</Text>
                <TextInput style={styles.input} placeholder="Address..." placeholderTextColor={colors.text.muted} value={unitAddress} onChangeText={setUnitAddress} />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>City</Text>
                    <TextInput style={styles.input} placeholder="City" placeholderTextColor={colors.text.muted} value={unitCity} onChangeText={setUnitCity} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>State</Text>
                    <TextInput style={styles.input} placeholder="State" placeholderTextColor={colors.text.muted} value={unitState} onChangeText={setUnitState} />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Pincode</Text>
                    <TextInput style={styles.input} placeholder="Pincode" placeholderTextColor={colors.text.muted} value={unitPincode} onChangeText={setUnitPincode} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Phone</Text>
                    <TextInput style={styles.input} placeholder="Phone" placeholderTextColor={colors.text.muted} value={unitPhone} onChangeText={setUnitPhone} keyboardType="phone-pad" />
                  </View>
                </View>

                <Text style={styles.label}>Contact Person</Text>
                <TextInput style={styles.input} placeholder="Contact Person Name" placeholderTextColor={colors.text.muted} value={unitContact} onChangeText={setUnitContact} />
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity style={[styles.btnPrimary, { flex: 1, backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border }]} onPress={() => setUnitModalVisible(false)}>
                  <Text style={[styles.btnText, { color: colors.text.primary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={handleSaveUnit} disabled={savingUnit}>
                  {savingUnit ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnText}>Save Unit</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.md,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.sm,
  },
  tabActiveButton: {
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  tabActiveText: {
    color: colors.primary,
    fontWeight: '800',
  },
  layoutGrid: {
    width: '100%',
    gap: Spacing.lg,
  },
  formContainer: {
    gap: Spacing.lg,
  },
  sidebarContainer: {
    gap: Spacing.lg,
  },
  card: {
    backgroundColor: colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Spacing.lg,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 12,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text.primary,
  },
  cardContent: {
    gap: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  input: {
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.text.primary,
    marginBottom: 4,
  },
  rowInputs: {
    flexDirection: 'row',
  },
  btnPrimary: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.md,
    paddingVertical: 12,
    marginTop: 8,
  },
  btnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: colors.border,
    borderWidth: 1,
    borderColor: colors.border,
  },
  overviewAvatarContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.02)',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
  },
  overviewName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 4,
  },
  overviewEmail: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 12,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  permissionText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.02)',
  },
  metaLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  metaValue: {
    fontSize: 12,
    color: colors.text.primary,
    fontWeight: '700',
  },
});