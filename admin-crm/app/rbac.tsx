import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  Pressable,
  Alert,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import { api } from '../utils/api';
import { Spacing, Radius, LightColors } from '../constants/theme';

type UserItem = {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'agent';
  canAccessCash: boolean;
};

export default function RbacScreen() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // New User Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'manager' | 'agent'>('agent');
  const [newCanAccessCash, setNewCanAccessCash] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err: any) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (userId: string, currentRole: string, targetRole: 'admin' | 'manager' | 'agent') => {
    if (currentRole === targetRole) return;
    setActionLoading(userId);
    try {
      // If setting to admin, automatically check/grant cash access as per plan
      const updates: { role: 'admin' | 'manager' | 'agent'; canAccessCash?: boolean } = { role: targetRole };
      if (targetRole === 'admin') {
        updates.canAccessCash = true;
      }
      const updated = await api.updateUserPermissions(userId, updates);
      setUsers(prev => prev.map(u => u._id === userId ? { ...u, role: updated.role, canAccessCash: updated.canAccessCash } : u));
    } catch (err: any) {
      alert(err.message || 'Failed to update user role');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCashToggle = async (userId: string, newValue: boolean) => {
    setActionLoading(userId);
    try {
      const updated = await api.updateUserPermissions(userId, { canAccessCash: newValue });
      setUsers(prev => prev.map(u => u._id === userId ? { ...u, canAccessCash: updated.canAccessCash } : u));
    } catch (err: any) {
      alert(err.message || 'Failed to toggle cash access');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Are you sure you want to delete user "${userName}"? This cannot be undone.`)
      : await new Promise((resolve) => {
          Alert.alert(
            'Delete User',
            `Are you sure you want to delete user "${userName}"? This cannot be undone.`,
            [
              { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
              { text: 'Delete', onPress: () => resolve(true), style: 'destructive' }
            ],
            { cancelable: true }
          );
        });

    if (!confirmed) return;

    setActionLoading(userId);
    try {
      await api.deleteUser(userId);
      setUsers(prev => prev.filter(u => u._id !== userId));
    } catch (err: any) {
      alert(err.message || 'Failed to delete user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateUser = async () => {
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      setModalError('All fields are required.');
      return;
    }
    setModalSubmitting(true);
    setModalError('');
    try {
      await api.register({
        name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        role: newRole,
        canAccessCash: newCanAccessCash,
      });

      // Reset Form and close modal
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('agent');
      setNewCanAccessCash(false);
      setIsModalOpen(false);
      
      // Reload user list
      fetchUsers();
    } catch (err: any) {
      setModalError(err.message || 'Failed to create user.');
    } finally {
      setModalSubmitting(false);
    }
  };

  const roleColors: { [key: string]: string } = {
    admin: colors.danger,
    manager: colors.warning,
    agent: colors.success,
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading Access Controls...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitleText}>System User Directory</Text>
            <TouchableOpacity
              style={[
                styles.addButton,
                !isDesktop && { width: 32, height: 32, borderRadius: 16, paddingHorizontal: 0, paddingVertical: 0, justifyContent: 'center', alignItems: 'center' }
              ]}
              onPress={() => {
                setModalError('');
                setIsModalOpen(true);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="person-add-outline" size={15} color="#fff" />
              {isDesktop && <Text style={styles.addButtonText}>Add User</Text>}
            </TouchableOpacity>
          </View>
          
          {/* User grid table */}
          {users.map(item => (
            <View key={item._id} style={styles.userRow}>
              {/* Profile Info */}
              <View style={styles.userInfoCol}>
                <View style={[styles.avatar, { borderColor: roleColors[item.role] || colors.border }]}>
                  <Text style={[styles.avatarText, { color: roleColors[item.role] || colors.text.primary }]}>
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.userName}>{item.name}</Text>
                    <View style={[styles.roleBadge, { borderColor: roleColors[item.role], backgroundColor: roleColors[item.role] + '10' }]}>
                      <Text style={[styles.roleBadgeText, { color: roleColors[item.role] }]}>
                        {item.role.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.userEmail}>{item.email}</Text>
                </View>
              </View>

              {/* Role Action Switcher */}
              <View style={styles.actionsCol}>
                <View style={styles.roleGroup}>
                  {(['admin', 'manager', 'agent'] as const).map(roleOption => {
                    const isSelected = item.role === roleOption;
                    return (
                      <TouchableOpacity
                        key={roleOption}
                        style={[
                          styles.roleOptionBtn,
                          isSelected && {
                            backgroundColor: roleColors[roleOption] + '20',
                            borderColor: roleColors[roleOption],
                          }
                        ]}
                        onPress={() => handleRoleChange(item._id, item.role, roleOption)}
                        disabled={actionLoading === item._id}
                      >
                        <Text
                          style={[
                            styles.roleOptionText,
                            isSelected && { color: roleColors[roleOption], fontWeight: '700' }
                          ]}
                        >
                          {roleOption.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Cash Toggle Switch */}
                <View style={styles.cashToggleGroup}>
                  <View style={styles.toggleTextContainer}>
                    <Ionicons
                      name={item.canAccessCash ? 'cash-outline' : 'lock-closed-outline'}
                      size={14}
                      color={item.canAccessCash ? colors.success : colors.text.muted}
                    />
                    <Text style={[styles.cashToggleLabel, item.canAccessCash && { color: colors.success, fontWeight: '600' }]}>
                      Cash Ledger Access
                    </Text>
                  </View>
                  <Switch
                    value={item.canAccessCash}
                    onValueChange={(val) => handleCashToggle(item._id, val)}
                    disabled={actionLoading === item._id || item.role === 'admin'}
                    trackColor={{ false: colors.border, true: colors.success + '40' }}
                    thumbColor={item.canAccessCash ? colors.success : colors.text.muted}
                  />
                </View>

                {/* Delete User Action */}
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteUser(item._id, item.name)}
                  disabled={actionLoading === item._id}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </TouchableOpacity>
              </View>

              {actionLoading === item._id && (
                <View style={styles.rowOverlay}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              )}
            </View>
          ))}

          {users.length === 0 && (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={40} color={colors.text.muted} />
              <Text style={styles.emptyText}>No users registered in system</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Register User Modal */}
      <Modal visible={isModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsModalOpen(false)} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Register New User</Text>
              <TouchableOpacity onPress={() => setIsModalOpen(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            {modalError ? (
              <View style={styles.errorAlert}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.errorAlertText}>{modalError}</Text>
              </View>
            ) : null}

            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter user name"
                placeholderTextColor={colors.text.muted}
                value={newName}
                onChangeText={setNewName}
              />

              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter email address"
                placeholderTextColor={colors.text.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={newEmail}
                onChangeText={setNewEmail}
              />

              <Text style={styles.inputLabel}>Initial Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter account password"
                placeholderTextColor={colors.text.muted}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />

              <Text style={styles.inputLabel}>Assign System Role</Text>
              <View style={styles.modalRoleGroup}>
                {(['admin', 'manager', 'agent'] as const).map(role => {
                  const isSel = newRole === role;
                  return (
                    <TouchableOpacity
                      key={role}
                      style={[
                        styles.modalRoleBtn,
                        isSel && { borderColor: roleColors[role], backgroundColor: roleColors[role] + '10' }
                      ]}
                      onPress={() => {
                        setNewRole(role);
                        if (role === 'admin') setNewCanAccessCash(true);
                      }}
                    >
                      <View style={[styles.radioDot, isSel && { backgroundColor: roleColors[role] }]} />
                      <Text style={[styles.modalRoleText, isSel && { color: roleColors[role], fontWeight: '700' }]}>
                        {role.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.modalCashAccessRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.modalCashLabel}>Grant Cash Access</Text>
                  <Text style={styles.modalCashDesc}>
                    Allows view/edit actions for cash transactions and ledger tabs.
                  </Text>
                </View>
                <Switch
                  value={newCanAccessCash}
                  onValueChange={setNewCanAccessCash}
                  disabled={newRole === 'admin'}
                  trackColor={{ false: colors.border, true: colors.success + '40' }}
                  thumbColor={newCanAccessCash ? colors.success : colors.text.muted}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setIsModalOpen(false)}
                disabled={modalSubmitting}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleCreateUser}
                disabled={modalSubmitting}
              >
                {modalSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Create Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg.primary,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.bg.primary,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: Radius.md,
      gap: 4,
    },
    addButtonText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    scrollContent: {
      padding: Spacing.lg,
    },
    card: {
      backgroundColor: colors.bg.card,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing.lg,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: 10,
    },
    cardTitleText: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text.primary,
    },
    userRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingVertical: 16,
      position: 'relative',
      gap: 12,
    },
    userInfoCol: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minWidth: 260,
      flex: 1,
    },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 2,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.02)',
    },
    avatarText: {
      fontSize: 16,
      fontWeight: '800',
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 3,
    },
    userName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
    },
    roleBadge: {
      borderWidth: 1,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 1.5,
    },
    roleBadgeText: {
      fontSize: 8,
      fontWeight: '800',
    },
    userEmail: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    actionsCol: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 20,
    },
    roleGroup: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.sm,
      overflow: 'hidden',
    },
    roleOptionBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      backgroundColor: 'rgba(0,0,0,0.01)',
    },
    roleOptionText: {
      fontSize: 9,
      fontWeight: '600',
      color: colors.text.muted,
    },
    cashToggleGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    toggleTextContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    cashToggleLabel: {
      fontSize: 11,
      color: colors.text.secondary,
    },
    deleteBtn: {
      padding: 6,
      borderRadius: Radius.sm,
      borderWidth: 1,
      borderColor: colors.danger + '20',
      backgroundColor: colors.danger + '08',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(255,255,255,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.md,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      gap: 10,
    },
    emptyText: {
      fontSize: 13,
      color: colors.text.muted,
      fontWeight: '600',
    },
    // Modal Styles
    modalOverlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContainer: {
      width: '90%',
      maxWidth: 480,
      maxHeight: '90%',
      backgroundColor: colors.bg.card,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      elevation: 20,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.bg.secondary,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text.primary,
    },
    modalCloseBtn: {
      padding: 4,
    },
    modalForm: {
      padding: Spacing.lg,
    },
    inputLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text.secondary,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
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
      marginBottom: 16,
    },
    modalRoleGroup: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 20,
    },
    modalRoleBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: Radius.md,
      paddingVertical: 10,
    },
    modalRoleText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    radioDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: 'rgba(0,0,0,0.1)',
    },
    modalCashAccessRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bg.secondary,
      borderRadius: Radius.md,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 10,
    },
    modalCashLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 2,
    },
    modalCashDesc: {
      fontSize: 11,
      color: colors.text.muted,
      lineHeight: 14,
    },
    modalFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: Spacing.lg,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 12,
      backgroundColor: colors.bg.secondary,
    },
    cancelBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelBtnText: {
      color: colors.text.secondary,
      fontSize: 13,
      fontWeight: '700',
    },
    submitBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: Radius.md,
      justifyContent: 'center',
      alignItems: 'center',
      minWidth: 110,
    },
    submitBtnText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
    },
    errorAlert: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.danger + '10',
      borderWidth: 1,
      borderColor: colors.danger + '30',
      borderRadius: Radius.md,
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.md,
      padding: 10,
    },
    errorAlertText: {
      color: colors.danger,
      fontSize: 12,
      fontWeight: '600',
      flex: 1,
    },
  });
