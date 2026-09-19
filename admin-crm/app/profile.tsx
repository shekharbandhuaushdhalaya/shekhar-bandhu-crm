import { StatusPill } from './../components/WorkspacePrimitives';
import { PressableOpacity as TouchableOpacity } from './../components/PressableOpacity';
import { AppTextInput as TextInput } from './../components/AppTextInput';
import { AppText as Text } from './../components/AppText';
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Alert, useWindowDimensions, RefreshControl, Platform, Modal, Linking, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../utils/auth';
import { usePermission } from '../utils/permissions';
import { useTheme, useStyles } from '../utils/themeContext';
import { useToast } from '../utils/ToastContext';
import { api, getApiBaseUrl, setApiBaseUrl } from '../utils/api';
import { authStorage } from '../utils/storage';
import { CustomDatePicker } from '../components/CustomDatePicker';
import { useConfirm } from '../utils/ConfirmContext';
import { updateActiveFirmDetails } from '../constants/firm';
import { Spacing, Radius, LightColors, Typography } from '../constants/theme';
import { PageHeader } from '../components/PageHeader';
import AyurvedicLoader from '../components/AyurvedicLoader';

export default function ProfileScreen() {
  const { user, updateUser, switchFirm } = useAuth();
  const perm = usePermission();
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;

  const [firmsList, setFirmsList] = useState<any[]>([]);
  const [switchingFirmId, setSwitchingFirmId] = useState<string | null>(null);

  const loadFirmsList = async () => {
    try {
      const list = await api.getFirms();
      setFirmsList(list || []);
    } catch (_) {}
  };

  const handleSelectFirm = async (firmId: string) => {
    if (String(firmId) === String(user?.firmId)) return;
    setSwitchingFirmId(firmId);
    try {
      await switchFirm(firmId);
      showToast('Active business firm switched successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to switch active firm.', 'error');
    } finally {
      setSwitchingFirmId(null);
    }
  };

  // Tab State for Admin & Profile
  const [activeTab, setActiveTab] = useState<'profile' | 'company' | 'units'>('profile');
  const [companySubTab, setCompanySubTab] = useState<'general' | 'integrations' | 'billing'>('general');

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

  const [socialAccounts, setSocialAccounts] = useState<{
    id: string;
    name: string;
    page: string;
    followers: string;
    icon: any;
    connected: boolean;
    color: string;
    dbId?: string;
  }[]>([
    { id: 'facebook', name: 'Facebook Page', page: 'Shekhar Bandhu Aushadhalaya', followers: '15.4k followers', icon: 'logo-facebook' as const, connected: true, color: '#1877f2' },
    { id: 'instagram', name: 'Instagram Business', page: '@shekhar_bandhu_official', followers: '8.9k followers', icon: 'logo-instagram' as const, connected: true, color: '#e1306c' },
    { id: 'google', name: 'Google Ads & Analytics', page: 'GA4 - Shekhar Bandhu CRM', followers: 'API Connected', icon: 'logo-google' as const, connected: false, color: '#ea4335' },
    { id: 'linkedin', name: 'LinkedIn Company', page: 'Shekhar Bandhu Pharmaceuticals', followers: '2.1k followers', icon: 'logo-linkedin' as const, connected: false, color: '#0077b5' },
    { id: 'whatsapp', name: 'WhatsApp Business', page: '+91 98765 43210', followers: '3.2k reach', icon: 'logo-whatsapp' as const, connected: true, color: '#25d366' },
  ]);

  const fetchSocialAccounts = useCallback(async () => {
    try {
      const connectedList = await api.getSocialAccounts();
      setSocialAccounts(prev => prev.map(acc => {
        const match = connectedList.find((c: any) => c.platform === acc.id);
        if (match) {
          return {
            ...acc,
            connected: true,
            dbId: match._id,
            page: match.accountName || acc.page,
            followers: match.followersCount === 'Connected' ? acc.followers : match.followersCount || acc.followers
          };
        }
        return { ...acc, connected: false, dbId: undefined };
      }));
    } catch (err) {
      console.error('Failed to fetch social integrations:', err);
    }
  }, []);

  const toggleAccountConnection = async (id: string) => {
    const acc = socialAccounts.find(a => a.id === id);
    if (!acc) return;

    if (acc.connected) {
      confirm({
        title: 'Disconnect Integration',
        description: `Disconnect your ${acc.name} Integration?`,
        destructive: true,
        iconName: 'trash',
        onConfirm: async () => {
          try {
            if (acc.dbId) {
              await api.disconnectSocialAccount(acc.dbId);
            }
            setSocialAccounts(prev => prev.map(a => a.id === id ? { ...a, connected: false, dbId: undefined } : a));
            showToast(`${acc.name} disconnected successfully.`, 'success');
          } catch (err: any) {
            showToast(err.message || 'Failed to disconnect account', 'error');
          }
        }
      });
      return;
    } else {
      try {
        const { url } = await api.getSocialAuthUrl();
        if (Platform.OS === 'web') {
          window.open(url, '_blank');
        } else {
          Linking.openURL(url);
        }
        showToast('Meta consent page opened. Once authenticated, refresh to see linked accounts!', 'info');
      } catch (err: any) {
        showToast(err.message || 'Meta OAuth initiation failed', 'error');
      }
    }
  };

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

  // MFA states
  const [mfaSetupModalVisible, setMfaSetupModalVisible] = useState(false);
  const [mfaDisableModalVisible, setMfaDisableModalVisible] = useState(false);
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaQrCode, setMfaQrCode] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaPassword, setMfaPassword] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

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
  const [loadingIfsc, setLoadingIfsc] = useState(false);

  const handleIfscChange = async (val: string) => {
    const upper = val.toUpperCase();
    setBankIfsc(upper);

    const cleaned = upper.trim();
    if (cleaned.length === 11) {
      setLoadingIfsc(true);
      try {
        const res = await fetch(`https://ifsc.razorpay.com/${cleaned}`);
        if (res.ok) {
          const data = await res.json();
          if (data.BANK) setBankName(data.BANK);
          if (data.BRANCH) setBankBranch(data.BRANCH);
        } else {
          // Fallback prefix lookup
          const prefix = cleaned.substring(0, 4);
          const bankMap: Record<string, string> = {
            'SBIN': 'State Bank of India',
            'HDFC': 'HDFC Bank',
            'ICIC': 'ICICI Bank',
            'PUNB': 'Punjab National Bank',
            'BARB': 'Bank of Baroda',
            'CNRB': 'Canara Bank',
            'UBIN': 'Union Bank of India',
            'BKID': 'Bank of India',
            'IDIB': 'Indian Bank',
            'KKBK': 'Kotak Mahindra Bank',
            'UTIB': 'Axis Bank',
            'YESB': 'Yes Bank',
            'MAHB': 'Bank of Maharashtra',
          };
          if (bankMap[prefix]) {
            setBankName(bankMap[prefix]);
          }
        }
      } catch (err) {
        console.log('IFSC fetch error:', err);
      } finally {
        setLoadingIfsc(false);
      }
    }
  };

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
      await Promise.all([loadSessionDetails(), loadCompanyConfig(), loadManufacturingUnits(), fetchSocialAccounts(), loadFirmsList()]);
    };
    init();
  }, [user, fetchSocialAccounts]);

  const handleRefresh = async () => {
    setRefreshing(true);
    api.clearCache();
    await loadSessionDetails();
    await loadCompanyConfig();
    await loadManufacturingUnits();
    await fetchSocialAccounts();
    await loadFirmsList();
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
      showToast('Name and Email are required.', 'error');
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
      showToast('All password fields are required.', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('New password must be at least 6 characters long.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match.', 'error');
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

  // MFA Handlers
  const handleSetupMfa = async () => {
    try {
      setMfaLoading(true);
      const data = await api.setupMfa();
      setMfaSecret(data.secret);
      setMfaQrCode(data.qrCode);
      setMfaCode('');
      setMfaSetupModalVisible(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to initialize MFA setup', 'error');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleVerifyMfa = async () => {
    if (!mfaCode || mfaCode.length !== 6) {
      showToast('Enter a valid 6-digit code', 'error');
      return;
    }
    try {
      setMfaLoading(true);
      await api.verifyMfaSetup(mfaCode);
      showToast('MFA successfully enabled!', 'success');
      setMfaSetupModalVisible(false);
      setMfaCode('');
      // Update user context to reflect MFA enabled
      if (user) {
        await updateUser({ ...user, mfaEnabled: true });
      }
    } catch (err: any) {
      showToast(err.message || 'Invalid code', 'error');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!mfaPassword || !mfaCode || mfaCode.length !== 6) {
      showToast('Password and 6-digit TOTP code are required', 'error');
      return;
    }
    try {
      setMfaLoading(true);
      await api.disableMfa(mfaPassword, mfaCode);
      showToast('MFA successfully disabled', 'success');
      setMfaDisableModalVisible(false);
      setMfaPassword('');
      setMfaCode('');
      // Update user context
      if (user) {
        await updateUser({ ...user, mfaEnabled: false });
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to disable MFA. Check your password and code.', 'error');
    } finally {
      setMfaLoading(false);
    }
  };

  // Server URL update handler
  const handleSaveServerUrl = async () => {
    if (!serverUrl.trim()) {
      showToast('Server URL cannot be empty.', 'error');
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
      showToast('Firm name is required.', 'error');
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

  const renderForms = () => {
    const isProfileChanged = name.trim() !== (user?.name || '').trim();
    const isPasswordValid = currentPassword.trim().length > 0 && newPassword.length >= 6 && confirmPassword === newPassword;

    return (
      <View style={styles.formContainer}>
        {/* Active Firm Selection Card */}
        {firmsList.length > 0 && (
          <View style={[styles.card, { width: '100%', marginBottom: 16 }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="business-outline" size={18} color={colors.primary} />
              <Text style={styles.cardTitle}>Active Business Entity / Firm Context</Text>
            </View>
            <View style={styles.cardContent}>
              <Text style={[styles.label, { marginBottom: 10, textTransform: 'none' }]}>
                Select the active firm context for processing invoices, orders, inventory, and reports:
              </Text>
              <View style={{ gap: 10 }}>
                {firmsList.map((f) => {
                  const isSelected = String(f._id) === String(user?.firmId) || (!user?.firmId && f.isDefault);
                  const isLoadingThis = switchingFirmId === String(f._id);
                  return (
                    <TouchableOpacity
                      key={String(f._id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 14,
                        borderRadius: Radius.md,
                        borderWidth: 1.5,
                        borderColor: isSelected ? colors.primary : colors.border,
                        backgroundColor: isSelected ? colors.primaryLight : colors.bg.primary,
                      }}
                      disabled={switchingFirmId !== null}
                      onPress={() => handleSelectFirm(String(f._id))}
                      activeOpacity={0.75}
                    >
                      <View style={{ marginRight: 12 }}>
                        <Ionicons
                          name={isSelected ? 'checkmark-circle' : 'business-outline'}
                          size={22}
                          color={isSelected ? colors.primary : colors.text.muted}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ ...Typography.body, fontWeight: '700', color: colors.text.primary }}>{f.name}</Text>
                        <Text style={{ ...Typography.caption, color: colors.text.muted, marginTop: 2 }}>
                          {f.role || 'Member Entity'} {f.firmGstin ? `• GSTIN: ${f.firmGstin}` : ''}
                        </Text>
                      </View>
                      {isLoadingThis ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : isSelected ? (
                        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.primary }}>
                          <Text style={{ ...Typography.eyebrow, fontWeight: '800', color: '#ffffff' }}>Active</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 16, alignItems: 'stretch' }}>
          {/* Personal Details Card */}
          <View style={[styles.card, { flex: 1, width: '100%' }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="person-outline" size={18} color={colors.primary} />
              <Text style={styles.cardTitle}>Personal Details & Account Security</Text>
            </View>
            <View style={[styles.cardContent, { justifyContent: 'space-between', flex: 1 }]}>
              <View style={{ gap: 12 }}>
                <View>
                  <Text style={styles.label}>Full Name</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Enter full name"
                    placeholderTextColor={colors.text.muted}
                  />
                </View>
                <View>
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
                style={[styles.btnPrimary, { marginTop: 20 }, (!isProfileChanged || profileLoading) && { opacity: 0.5 }]}
                onPress={handleSaveProfile}
                disabled={profileLoading || !isProfileChanged}
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
            </View>
          </View>

          {/* Change Password Card */}
          <View style={[styles.card, { flex: 1, width: '100%' }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="key-outline" size={18} color={colors.primary} />
              <Text style={styles.cardTitle}>Change Account Password</Text>
            </View>
            <View style={[styles.cardContent, { justifyContent: 'space-between', flex: 1 }]}>
              <View style={{ gap: 12 }}>
                <View>
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
                </View>

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

                    {newPassword.length > 0 && (
                      <View style={{ marginTop: 6, gap: 4 }}>
                        <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' }}>
                          <View style={{ width: `${passStrength.score}%`, height: '100%', backgroundColor: passStrength.color }} />
                        </View>
                        <Text style={{ ...Typography.eyebrow, fontWeight: '700', color: passStrength.color }}>
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

                    {confirmPassword.length > 0 && (
                      <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons
                          name={isMatching ? "checkmark-circle" : "close-circle"}
                          size={14}
                          color={isMatching ? colors.success : colors.danger}
                        />
                        <Text style={{ ...Typography.eyebrow, fontWeight: '800', color: isMatching ? colors.success : colors.danger }}>
                          {isMatching ? ' Passwords Match' : ' Passwords do not match'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: colors.warning, marginTop: 20 }, (!isPasswordValid || passwordLoading) && { opacity: 0.5 }]}
                onPress={handleChangePassword}
                disabled={passwordLoading || !isPasswordValid}
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

        {/* Two-Factor Authentication (MFA) Card */}
        <View style={[styles.card, { marginTop: 16 }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
            <Text style={styles.cardTitle}>Two-Factor Authentication (2FA)</Text>
          </View>
          <View style={[styles.cardContent, { flexDirection: isDesktop ? 'row' : 'column', justifyContent: 'space-between', alignItems: isDesktop ? 'center' : 'flex-start', gap: 16 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.primary, marginBottom: 4 }}>
                {user?.mfaEnabled ? '2FA is Currently Enabled' : '2FA is Not Enabled'}
              </Text>
              <Text style={{ ...Typography.caption, color: colors.text.muted }}>
                Add an extra layer of security to your account. When enabled, you will need to enter a time-based code from an authenticator app (like Google Authenticator) during login.
              </Text>
            </View>
            <View>
              {user?.mfaEnabled ? (
                <TouchableOpacity
                  style={[styles.btnPrimary, { backgroundColor: colors.danger, minWidth: 160, marginTop: 0 }]}
                  onPress={() => setMfaDisableModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="shield-half-outline" size={16} color="#fff" />
                  <Text style={styles.btnText}>Disable 2FA</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.btnPrimary, { minWidth: 160, marginTop: 0 }]}
                  onPress={handleSetupMfa}
                  disabled={mfaLoading}
                  activeOpacity={0.8}
                >
                  {mfaLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
                      <Text style={styles.btnText}>Enable 2FA</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const canEdit = perm.can('settings:edit');

  const renderCompanySettings = () => (
    <View style={styles.formContainer}>
      {!canEdit && (
        <View style={{ backgroundColor: colors.warning + '20', padding: Spacing.md, borderRadius: Radius.sm, marginBottom: Spacing.md }}>
          <Text style={{ ...Typography.bodySm, color: colors.warning, fontWeight: '600' }}>
            Viewing company configuration. Only administrators can edit these settings.
          </Text>
        </View>
      )}

      {/* Company Sub-Tab Selector */}
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, backgroundColor: 'transparent', padding: 0, borderRadius: Radius.md, borderWidth: 0 }}>
        {[
          { id: 'general', label: 'General Info', icon: 'business-outline' },
          { id: 'integrations', label: 'Integrations & AI', icon: 'logo-instagram' },
          { id: 'billing', label: 'Billing & Server', icon: 'options-outline' },
        ].map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 8,
              borderRadius: Radius.sm,
              backgroundColor: companySubTab === tab.id ? colors.primary + '12' : 'transparent',
              borderWidth: companySubTab === tab.id ? 1 : 0,
              borderColor: colors.primary,
            }}
            onPress={() => setCompanySubTab(tab.id as any)}
          >
            <Ionicons name={tab.icon as any} size={14} color={companySubTab === tab.id ? colors.primary : colors.text.secondary} />
            <Text style={{ ...Typography.bodySm, fontWeight: '700', color: companySubTab === tab.id ? colors.primary : colors.text.secondary }} numberOfLines={1}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {companySubTab === 'general' && (
        <>
          {/* Firm details card */}
          <View style={[styles.card, !canEdit && { opacity: 0.85 }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="business-outline" size={18} color={colors.primary} />
              <Text style={styles.cardTitle}>Firm Details</Text>
            </View>
            <View style={[styles.cardContent, { pointerEvents: canEdit ? 'auto' : 'none' }]}>
              {/* Row 1: Firm Name, GSTIN, Phone */}
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Firm / Company Name</Text>
                  <TextInput
                    style={styles.input}
                    value={firmName}
                    onChangeText={setFirmName}
                    placeholder="Enter firm name"
                    placeholderTextColor={colors.text.muted}
                  />
                </View>
                <View style={{ flex: 1 }}>
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
              </View>

              {/* Row 2: Address, Email */}
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Address</Text>
                  <TextInput
                    style={[styles.input, { minHeight: 40 }]}
                    value={firmAddress}
                    onChangeText={setFirmAddress}
                    placeholder="Enter billing address"
                    placeholderTextColor={colors.text.muted}
                    multiline
                  />
                </View>
                <View style={{ flex: 1 }}>
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
                </View>
              </View>

              <View style={[styles.divider, { marginVertical: 12 }]} />

              {/* AYUSH Manufacturing License & GMP Section */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
                <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.text.primary }}>AYUSH Manufacturing License & GMP</Text>
              </View>

              <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginBottom: 10 }}>
                Enter your AYUSH / State Drug Authority manufacturing license number and GMP certificate details. License format: e.g. "AYU/MFG/UP/12345" or as issued by your State Licensing Authority under Drugs & Cosmetics Act.
              </Text>

              {/* Row 3: All 4 License & GMP Fields in One Row */}
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
                <View style={{ flex: 2 }}>
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
                    <Text style={{ ...Typography.eyebrow, color: colors.danger, marginTop: -2, marginBottom: 6 }}> Invalid format</Text>
                  ) : manufacturingLicenseNo.trim() ? (
                    <Text style={{ ...Typography.eyebrow, color: colors.success, marginTop: -2, marginBottom: 6 }}> Valid format</Text>
                  ) : null}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Valid Till</Text>
                  <CustomDatePicker
                    value={licenseValidTill}
                    onChange={setLicenseValidTill}
                    placeholder="YYYY-MM-DD"
                    compact
                  />
                  {licenseValidTill && new Date(licenseValidTill) < new Date() ? (
                    <Text style={{ ...Typography.eyebrow, color: colors.danger, marginTop: 4, marginBottom: 6 }}> Expired</Text>
                  ) : null}
                </View>

                <View style={{ flex: 2 }}>
                  <Text style={styles.label}>GMP Certificate No.</Text>
                  <TextInput
                    style={styles.input}
                    value={gmpCertificateNo}
                    onChangeText={setGmpCertificateNo}
                    placeholder="e.g. GMP/UP/2026/789"
                    placeholderTextColor={colors.text.muted}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>GMP Valid Till</Text>
                  <CustomDatePicker
                    value={gmpValidTill}
                    onChange={setGmpValidTill}
                    placeholder="YYYY-MM-DD"
                    compact
                    alignRight
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Bank, UPI & Payment Gateway Settlement Details Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="card-outline" size={18} color={colors.primary} />
              <Text style={styles.cardTitle}>Bank, UPI & Payment Gateway Settlement Details</Text>
            </View>
            <View style={[styles.cardContent, { pointerEvents: canEdit ? 'auto' : 'none' }]}>
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 24 }}>
                {/* Left Side: Bank Account Details */}
                <View style={{ flex: 1.2 }}>
                  <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.primary, marginBottom: 12 }}>
                     Bank Account Details
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>IFSC Code *</Text>
                      <View style={{ position: 'relative', justifyContent: 'center' }}>
                        <TextInput
                          style={[styles.input, { paddingRight: loadingIfsc ? 36 : 12 }, bankIfsc.trim() && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(bankIfsc.trim()) ? { borderColor: colors.danger } : {}]}
                          value={bankIfsc}
                          onChangeText={handleIfscChange}
                          placeholder="e.g. SBIN0001234"
                          placeholderTextColor={colors.text.muted}
                          autoCapitalize="characters"
                          maxLength={11}
                        />
                        {loadingIfsc && (
                          <View style={{ position: 'absolute', right: 10, top: 12 }}>
                            <ActivityIndicator size="small" color={colors.primary} />
                          </View>
                        )}
                      </View>
                      {bankIfsc.trim() && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(bankIfsc.trim()) ? (
                        <Text style={{ ...Typography.eyebrow, color: colors.danger, marginTop: 4, marginBottom: 6 }}> Invalid 11-digit IFSC code</Text>
                      ) : null}
                    </View>

                    <View style={{ flex: 1.2 }}>
                      <Text style={styles.label}>Account Number *</Text>
                      <TextInput
                        style={styles.input}
                        value={bankAccountNo}
                        onChangeText={setBankAccountNo}
                        placeholder="e.g. 30123456789"
                        placeholderTextColor={colors.text.muted}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.label}>Bank Name</Text>
                        <Text style={{ ...Typography.eyebrow, color: colors.text.muted, fontStyle: 'italic', marginBottom: 6 }}>(Auto-filled)</Text>
                      </View>
                      <TextInput
                        style={styles.input}
                        value={bankName}
                        onChangeText={setBankName}
                        placeholder="Auto-filled from IFSC"
                        placeholderTextColor={colors.text.muted}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.label}>Branch Name</Text>
                        <Text style={{ ...Typography.eyebrow, color: colors.text.muted, fontStyle: 'italic', marginBottom: 6 }}>(Auto-filled)</Text>
                      </View>
                      <TextInput
                        style={styles.input}
                        value={bankBranch}
                        onChangeText={setBankBranch}
                        placeholder="Branch details"
                        placeholderTextColor={colors.text.muted}
                      />
                    </View>
                  </View>
                </View>

                {/* Vertical Divider for Desktop */}
                {isDesktop && <View style={{ width: 1, backgroundColor: colors.border, alignSelf: 'stretch' }} />}

                {/* Right Side: UPI & QR Code Details */}
                <View style={{ flex: 1.2 }}>
                  <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.primary, marginBottom: 12 }}>
                     UPI & QR Code Details
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
                    {/* Left sub-column: UPI ID + Upload Button */}
                    <View style={{ flex: 1 }}>
                      <View style={{ marginBottom: 10 }}>
                        <Text style={styles.label}>UPI ID</Text>
                        <TextInput
                          style={styles.input}
                          value={bankUpi}
                          onChangeText={setBankUpi}
                          placeholder="e.g. firm@upi"
                          placeholderTextColor={colors.text.muted}
                          autoCapitalize="none"
                        />
                      </View>

                      <Text style={styles.label}>QR Code Image</Text>
                      <TouchableOpacity
                        style={{
                          backgroundColor: colors.primary + '12',
                          borderWidth: 1,
                          borderStyle: 'dashed',
                          borderColor: colors.primary,
                          borderRadius: Radius.md,
                          paddingHorizontal: 12,
                          height: 42,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
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
                        <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.primary }} numberOfLines={1}>
                          {qrUploading ? 'Uploading...' : (qrImageUrl || qrImageBase64) ? 'Change QR' : 'Upload QR Image'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Right sub-column: QR Code Preview */}
                    {(qrImageUrl || qrImageBase64) ? (
                      <View style={{ alignItems: 'flex-start' }}>
                        <Text style={{ ...Typography.eyebrow, fontWeight: '700', color: colors.text.muted, marginBottom: 4 }}>
                          Invoice QR Preview
                        </Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          {Platform.OS === 'web' ? (
                            <img 
                              src={qrImageUrl || qrImageBase64} 
                              style={{ 
                                height: 105, 
                                width: 105, 
                                borderRadius: 8, 
                                border: `1px solid ${colors.border}`, 
                                backgroundColor: '#ffffff',
                                padding: 4,
                                objectFit: 'contain',
                                
                              }} 
                            />
                          ) : (
                            <View style={{ padding: 8, backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                              <Ionicons name="qr-code" size={80} color={colors.text.primary} />
                            </View>
                          )}

                          {/* Delete Button OUTSIDE the QR Image Box */}
                          <TouchableOpacity
                            style={{
                              padding: 8,
                              backgroundColor: colors.danger + '12',
                              borderRadius: Radius.md,
                              borderWidth: 1,
                              borderColor: colors.danger + '30',
                              justifyContent: 'center',
                              alignItems: 'center',
                            }}
                            onPress={() => {
                              confirm({
                                title: 'Clear QR Image',
                                description: 'Are you sure you want to clear the QR code image?',
                                destructive: true,
                                iconName: 'trash',
                                onConfirm: async () => {
                                  setQrImageBase64('');
                                  setQrImageUrl('');
                                  showToast('QR code cleared.', 'info');
                                }
                              });
                            }}
                          >
                            <Ionicons name="trash-outline" size={16} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* Horizontal Divider */}
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 18 }} />

              {/* Bottom Section: Payment Gateway Credentials (Razorpay) */}
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.primary }}>
                     Online Payment Gateway Credentials (Razorpay)
                  </Text>

                  <TouchableOpacity
                    style={[styles.toggleBtn, paymentGatewayEnabled && { backgroundColor: colors.success }]}
                    onPress={() => setPaymentGatewayEnabled(!paymentGatewayEnabled)}
                  >
                    <Text style={{ ...Typography.caption, color: paymentGatewayEnabled ? '#fff' : colors.text.secondary, fontWeight: '700' }}>
                      {paymentGatewayEnabled ? 'ENABLED' : 'DISABLED'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginBottom: 12 }}>
                  Configure your Razorpay API keys to accept online customer invoice payments & auto-reconcile settlements.
                </Text>

                <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Razorpay Key ID</Text>
                    <TextInput
                      style={styles.input}
                      value={razorpayKeyId}
                      onChangeText={setRazorpayKeyId}
                      placeholder="e.g. rzp_live_xxxxxxxx"
                      placeholderTextColor={colors.text.muted}
                      autoCapitalize="none"
                    />
                  </View>

                  <View style={{ flex: 1 }}>
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
                  </View>

                  <View style={{ flex: 1 }}>
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
              </View>
            </View>
          </View>
        </>
      )}

      {companySubTab === 'integrations' && (
        <>
          {/* Connected Pages & Accounts Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="link-outline" size={18} color={colors.primary} />
              <Text style={styles.cardTitle}>Connected Pages & Accounts</Text>
            </View>
            <View style={styles.cardContent}>
              <Text style={{ ...Typography.caption, color: colors.text.muted, marginBottom: 12 }}>
                Link your brand's official social media pages, Google Ads, and communication channels to enable automated multi-platform promotions and analytics sync.
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {socialAccounts.map(acc => (
                  <View 
                    key={acc.id} 
                    style={{ 
                      width: isDesktop ? 'calc(20% - 8px)' as any : '48%', 
                      backgroundColor: colors.bg.primary, 
                      borderWidth: 1, 
                      borderColor: colors.border, 
                      borderRadius: Radius.md, 
                      padding: 10, 
                      gap: 2 
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: acc.color + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={acc.icon} size={16} color={acc.color} />
                      </View>
                      <Switch
                        value={acc.connected}
                        onValueChange={() => toggleAccountConnection(acc.id)}
                        trackColor={{ false: '#767577', true: colors.primary + '80' }}
                        thumbColor={acc.connected ? colors.primary : '#f4f3f4'}
                        style={Platform.OS === 'web' ? { transform: [{ scale: 0.8 }] } : { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                      />
                    </View>
                    <Text style={{ ...Typography.caption, fontWeight: '800', color: colors.text.primary }} numberOfLines={1}>{acc.name}</Text>
                    <Text style={{ ...Typography.eyebrow, color: colors.text.secondary }} numberOfLines={1}>
                      {acc.connected ? acc.page : 'Not Connected'}
                    </Text>
                    {acc.connected && (
                      <Text style={{ ...Typography.eyebrow, fontWeight: '700', color: colors.primary, marginTop: 1 }} numberOfLines={1}>
                        {acc.followers}
                      </Text>
                    )}
                  </View>
                ))}
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
              <Text style={{ ...Typography.caption, color: colors.text.muted, marginBottom: 12 }}>
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
              </View>
              <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginTop: 6 }}>
                Status: {geminiApiKey ? ' Key configured (Gemini 2.5 Flash Engine Enabled)' : ' Not configured'}
              </Text>
            </View>
          </View>

          {/* App Server Settings Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="server-outline" size={18} color={colors.primary} />
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
        </>
      )}

      {companySubTab === 'billing' && (
        <>
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
                style={[styles.input, { ...Typography.bodySm, minHeight: 100 }]}
                value={defaultTerms}
                onChangeText={setDefaultTerms}
                placeholder="Type default terms printed on documents..."
                placeholderTextColor={colors.text.muted}
                multiline
              />
            </View>
          </View>




        </>
      )}

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
            <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.secondary }}>Revert Changes</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderSidebar = () => (
    <View style={styles.sidebarContainer}>
      <View style={styles.card}>
        <View style={styles.overviewAvatarContainer}>
          <View style={[styles.avatar, { borderColor: roleColors[user?.role || 'agent'] }]}>
            <Text style={[styles.avatarText, { color: roleColors[user?.role || 'agent'] }]}>{userInitials}</Text>
          </View>
          <Text style={styles.overviewName}>{user?.name}</Text>
          <Text style={styles.overviewEmail}>{user?.email}</Text>

          <StatusPill  label={<>
              {user?.role?.toUpperCase()}
            </>} textStyle={[styles.badgeText, { color: roleColors[user?.role || 'agent'] }]} />
        </View>
      </View>
    </View>
  );

  const renderManufacturingUnits = () => (
    <View style={styles.formContainer}>
      <View style={[styles.card, { padding: 16 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="business-outline" size={20} color={colors.primary} />
            <Text style={{ ...Typography.h3, fontWeight: '800', color: colors.text.primary }}>Manufacturing Facilities & Units</Text>
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
                    <Text style={{ ...Typography.body, fontWeight: '800', color: colors.text.primary }}>{unit.name}</Text>
                    {unit.code ? (
                      <View style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ ...Typography.eyebrow, fontWeight: '800', color: colors.primary }}>{unit.code}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ backgroundColor: colors.success + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.sm }}>
                      <Text style={{ ...Typography.eyebrow, fontWeight: '800', color: colors.success }}>Operational</Text>
                    </View>
                    {canEdit && (
                      <TouchableOpacity
                        style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm, backgroundColor: colors.primary + '15', flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        onPress={() => handleOpenEditUnit(unit)}
                      >
                        <Ionicons name="pencil" size={12} color={colors.primary} />
                        <Text style={{ ...Typography.caption, fontWeight: '700', color: colors.primary }}>Edit Unit</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Text style={{ ...Typography.eyebrow, fontWeight: '700', color: colors.text.muted }}>Location</Text>
                    <Text style={{ ...Typography.caption, fontWeight: '600', color: colors.text.primary, marginTop: 2 }}>
                      {[unit.addressLine1, unit.city, unit.state, unit.pincode].filter(Boolean).join(', ') || 'No address specified'}
                    </Text>
                  </View>
                  {unit.contactPerson ? (
                    <View style={{ flex: 1, minWidth: 120 }}>
                      <Text style={{ ...Typography.eyebrow, fontWeight: '700', color: colors.text.muted }}>Contact</Text>
                      <Text style={{ ...Typography.caption, fontWeight: '600', color: colors.text.primary, marginTop: 2 }}>
                         {unit.contactPerson} {unit.phone ? `(${unit.phone})` : ''}
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
            <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.secondary, marginTop: 8 }}>No Manufacturing Units Configured</Text>
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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
    >
      <PageHeader 
        title="Settings & Profile" 
        subtitle="Manage credentials, workspace preferences, and application settings."
      />
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
            <Text style={{ ...Typography.eyebrow, fontWeight: '800', color: colors.success }}> Active Keys</Text>
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
            <Text style={{ ...Typography.eyebrow, fontWeight: '800', color: colors.primary }}> GST Verified</Text>
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
            <Text style={{ ...Typography.eyebrow, fontWeight: '800', color: colors.warning }}>{manufacturingUnits.length} Units</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.layoutGrid}>
        <View style={{ flex: 1 }}>
          {renderActiveTabContent()}
        </View>
      </View>

      {/* Modal: Define Manufacturing Unit */}
      {canEdit && (
        <Modal visible={unitModalVisible} transparent animationType="fade" onRequestClose={() => setUnitModalVisible(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
            <View style={{ backgroundColor: colors.bg.card, borderRadius: Radius.lg, width: '100%', maxWidth: 500, padding: 20, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ ...Typography.h3, fontWeight: '800', color: colors.text.primary }}>
                  {editingUnitId ? 'Edit Manufacturing Unit' : 'Define New Manufacturing Unit'}
                </Text>
                <TouchableOpacity onPress={() => setUnitModalVisible(false)}>
                  <Ionicons name="close" size={22} color={colors.text.primary} />
                </TouchableOpacity>
              </View>

              {unitError ? (
                <View style={{ backgroundColor: colors.danger + '15', padding: 10, borderRadius: Radius.sm, marginBottom: 12 }}>
                  <Text style={{ ...Typography.caption, color: colors.danger, fontWeight: '700' }}>{unitError}</Text>
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

      {/* MFA Setup Modal */}
      <Modal visible={mfaSetupModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 450 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set Up Two-Factor Authentication</Text>
              <TouchableOpacity onPress={() => setMfaSetupModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
            
            <View style={{ padding: Spacing.xl }}>
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ ...Typography.bodySm, color: colors.text.primary, textAlign: 'center', marginBottom: 16 }}>
                  1. Download Google Authenticator or Authy.{'\n'}
                  2. Scan the QR code below.
                </Text>
                {mfaQrCode ? (
                  <View style={{ padding: 10, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
                    <img src={mfaQrCode} style={{ width: 180, height: 180 }} alt="QR Code" />
                  </View>
                ) : (
                  <View style={{ width: 180, height: 180, backgroundColor: colors.bg.primary, justifyContent: 'center', alignItems: 'center', borderRadius: 8, marginBottom: 16 }}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                )}
                
                <Text style={{ ...Typography.caption, color: colors.text.muted }}>Can't scan? Use this secret key:</Text>
                <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.primary, marginTop: 4 }}>
                  {mfaSecret}
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={{ marginTop: 20 }}>
                <Text style={styles.label}>3. Enter 6-Digit Code</Text>
                <TextInput
                  style={[styles.input, { ...Typography.h2, fontWeight: '700', textAlign: 'center' }]}
                  placeholder="000000"
                  placeholderTextColor={colors.text.muted}
                  value={mfaCode}
                  onChangeText={v => setMfaCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>

              <TouchableOpacity
                style={[styles.btnPrimary, { marginTop: 20 }, mfaCode.length !== 6 && { opacity: 0.5 }]}
                onPress={handleVerifyMfa}
                disabled={mfaLoading || mfaCode.length !== 6}
              >
                {mfaLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Verify & Enable</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MFA Disable Modal */}
      <Modal visible={mfaDisableModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 400 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Disable Two-Factor Auth</Text>
              <TouchableOpacity onPress={() => setMfaDisableModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
            
            <View style={{ padding: Spacing.xl }}>
              <View style={{ backgroundColor: colors.warning + '15', padding: 12, borderRadius: Radius.sm, marginBottom: 20 }}>
                <Text style={{ ...Typography.bodySm, color: colors.warning, fontWeight: '600' }}>
                  Disabling 2FA makes your account less secure.
                </Text>
              </View>

              <View style={{ gap: 16 }}>
                <View>
                  <Text style={styles.label}>Current Password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter password"
                    secureTextEntry
                    value={mfaPassword}
                    onChangeText={setMfaPassword}
                  />
                </View>

                <View>
                  <Text style={styles.label}>Authenticator Code</Text>
                  <TextInput
                    style={[styles.input, { ...Typography.h3, fontWeight: '700' }]}
                    placeholder="000000"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={mfaCode}
                    onChangeText={v => setMfaCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => setMfaDisableModalVisible(false)}>
                  <Text style={styles.btnTextSecondary}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, { flex: 1, backgroundColor: colors.danger }]}
                  onPress={handleDisableMfa}
                  disabled={mfaLoading || !mfaPassword || mfaCode.length !== 6}
                >
                  {mfaLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Disable 2FA</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

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
  tabText: { ...Typography.bodySm, fontWeight: '600', color: colors.text.secondary },
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
    borderRadius: Radius.md,
    borderWidth: 0,
    padding: Spacing.lg,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 4,
    marginBottom: 14,
  },
  cardTitle: { ...Typography.h3, fontWeight: '700', color: colors.text.primary },
  cardContent: {
    gap: 12,
  },
  label: { ...Typography.caption, fontWeight: '700', color: colors.text.secondary, marginBottom: 2 },
  input: { ...Typography.bodySm, backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.text.primary, marginBottom: 4 },
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
  btnSecondary: {
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.md,
    paddingVertical: 12,
    marginTop: 8,
  },
  btnText: { ...Typography.bodySm, color: '#fff', fontWeight: '700' },
  btnTextSecondary: { ...Typography.bodySm, color: colors.text.primary, fontWeight: '700' },
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
  avatarText: { ...Typography.display, fontWeight: '800' },
  overviewName: { ...Typography.h2, fontWeight: '800', color: colors.text.primary, marginBottom: 4 },
  overviewEmail: { ...Typography.bodySm, color: colors.text.secondary, marginBottom: 12 },
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { ...Typography.eyebrow, fontWeight: '800' },
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
  permissionText: { ...Typography.bodySm, color: colors.text.secondary },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.02)',
  },
  metaLabel: { ...Typography.bodySm, color: colors.text.secondary, fontWeight: '500' },
  metaValue: { ...Typography.bodySm, color: colors.text.primary, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: colors.bg.card,
    borderRadius: Radius.lg,
    width: '100%',
    padding: 0,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  modalTitle: { ...Typography.h3, fontWeight: '800', color: colors.text.primary },
  closeBtn: {
    padding: 4,
  },
});