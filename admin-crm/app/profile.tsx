import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../utils/auth';
import { useTheme, useStyles } from '../utils/themeContext';
import { useToast } from '../utils/ToastContext';
import { api, getApiBaseUrl, setApiBaseUrl } from '../utils/api';
import { authStorage } from '../utils/storage';
import { Spacing, Radius, LightColors } from '../constants/theme';

export default function ProfileScreen() {
  const { user, updateUser } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { showToast } = useToast();
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;

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
  const [passwordLoading, setPasswordLoading] = useState(false);

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
          lastActive: latestUser.lastActive,
          ipAddress: latestUser.ipAddress,
          deviceInfo: latestUser.deviceInfo,
          createdAt: latestUser.createdAt
        });
      }
    } catch (err) {
      console.error('Failed to load user details:', err);
    }
  };

  useEffect(() => {
    loadSessionDetails();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSessionDetails();
    setRefreshing(false);
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

  const roleColors: { [key: string]: string } = {
    admin: colors.danger,
    manager: colors.warning,
    agent: colors.success,
  };

  const userInitials = user?.name ? user.name.split(' ').map(n => n.charAt(0)).join('').toUpperCase().slice(0, 2) : 'U';

  const formatTimestamp = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  const renderForms = () => (
    <View style={styles.formContainer}>
      {/* Profile Details Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="person-outline" size={18} color={colors.primary} />
          <Text style={styles.cardTitle}>Personal Details</Text>
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter full name"
            placeholderTextColor={colors.text.muted}
          />

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Enter email address"
            placeholderTextColor={colors.text.muted}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={handleSaveProfile}
            disabled={profileLoading}
            activeOpacity={0.8}
          >
            {profileLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                <Text style={styles.btnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Change Password Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="key-outline" size={18} color={colors.primary} />
          <Text style={styles.cardTitle}>Change Password</Text>
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.label}>Current Password</Text>
          <TextInput
            style={styles.input}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Enter current password"
            placeholderTextColor={colors.text.muted}
            secureTextEntry
          />

          <Text style={styles.label}>New Password</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Enter new password"
            placeholderTextColor={colors.text.muted}
            secureTextEntry
          />

          <Text style={styles.label}>Confirm New Password</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Re-enter new password"
            placeholderTextColor={colors.text.muted}
            secureTextEntry
          />

          <TouchableOpacity
            style={styles.btnPrimary}
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

      {/* App Server Settings Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="link-outline" size={18} color={colors.primary} />
          <Text style={styles.cardTitle}>App Server Settings</Text>
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.label}>Base API Server URL</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="e.g. http://192.168.1.100:5000/api"
            placeholderTextColor={colors.text.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={handleSaveServerUrl}
            activeOpacity={0.8}
          >
            <Ionicons name="save-outline" size={16} color="#fff" />
            <Text style={styles.btnText}>Save Server Link</Text>
          </TouchableOpacity>
        </View>
      </View>
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
    </View>
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
    >
      <View style={[styles.layoutGrid, { flexDirection: isDesktop ? 'row' : 'column' }]}>
        {isDesktop ? (
          <>
            <View style={{ flex: 2, marginRight: Spacing.lg }}>{renderForms()}</View>
            <View style={{ flex: 1 }}>{renderSidebar()}</View>
          </>
        ) : (
          <>
            {renderSidebar()}
            {renderForms()}
          </>
        )}
      </View>
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
