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
import { api, RolePermissionConfig } from '../utils/api';
import { Spacing, Radius, LightColors } from '../constants/theme';

type UserItem = {
  _id: string;
  name: string;
  email: string;
  role: string;
  canAccessCash: boolean;
  lastActive?: string;
  ipAddress?: string;
  deviceInfo?: string;
};

type TabType = 'users' | 'permissions';

function formatTimeAgo(dateStr: string) {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(diffMs)) return 'unknown';
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDay}d ago`;
  } catch (_) {
    return 'unknown';
  }
}

const BUILTIN_ROLES = ['admin', 'manager', 'agent'];

function getRoleColor(role: string, colors: typeof LightColors): string {
  if (role === 'admin') return colors.danger;
  if (role === 'manager') return colors.warning;
  if (role === 'agent') return colors.success;
  return colors.info || '#6366f1';
}

export default function RbacScreen() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;

  const [activeTab, setActiveTab] = useState<TabType>('users');

  // --- User Management State ---
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('agent');
  const [newCanAccessCash, setNewCanAccessCash] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // --- Permission Management State ---
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [allPermissions, setAllPermissions] = useState<string[]>([]);
  const [groupedPermissions, setGroupedPermissions] = useState<Record<string, string[]>>({});
  const [roleConfigs, setRoleConfigs] = useState<RolePermissionConfig[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('manager');
  const [editPermissions, setEditPermissions] = useState<Set<string>>(new Set());
  const [searchPerm, setSearchPerm] = useState('');

  // --- Create Role Modal ---
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [roleModalError, setRoleModalError] = useState('');
  const [roleModalSubmitting, setRoleModalSubmitting] = useState(false);

  // --- Delete Role Confirm ---
  const [deleteConfirmRole, setDeleteConfirmRole] = useState<string | null>(null);
  const [deletingRole, setDeletingRole] = useState(false);

  // --- Fetch Users ---
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

  // --- Fetch Permissions ---
  const fetchPermissions = useCallback(async () => {
    try {
      setPermLoading(true);
      const data = await api.getRBACPermissions();
      setAllPermissions(data.allPermissions);
      setGroupedPermissions(data.grouped);
      setRoleConfigs(data.roles);
      const config = data.roles.find(r => r.role === selectedRole);
      if (config) {
        setEditPermissions(new Set(config.permissions));
      }
    } catch (err: any) {
      console.error('Failed to fetch permissions:', err);
    } finally {
      setPermLoading(false);
    }
  }, [selectedRole]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (activeTab === 'permissions') {
      fetchPermissions();
    }
  }, [activeTab, fetchPermissions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 'users') {
      await fetchUsers();
    } else {
      await fetchPermissions();
    }
  }, [activeTab, fetchUsers, fetchPermissions]);

  // --- User Handlers ---
  const handleRoleChange = async (userId: string, currentRole: string, targetRole: string) => {
    if (currentRole === targetRole) return;
    setActionLoading(userId);
    try {
      const updates: { role: string; canAccessCash?: boolean } = { role: targetRole };
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
          Alert.alert('Delete User', `Delete user "${userName}"?`, [
            { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
            { text: 'Delete', onPress: () => resolve(true), style: 'destructive' }
          ]);
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
        role: newUserRole,
        canAccessCash: newCanAccessCash,
      });
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewUserRole('agent');
      setNewCanAccessCash(false);
      setIsUserModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      setModalError(err.message || 'Failed to create user.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // --- Permission Handlers ---
  const handleRoleSelect = (role: string) => {
    setSelectedRole(role);
    const config = roleConfigs.find(r => r.role === role);
    if (config) {
      setEditPermissions(new Set(config.permissions));
    }
  };

  const handleTogglePermission = (perm: string) => {
    setEditPermissions(prev => {
      const next = new Set(prev);
      if (next.has(perm)) {
        next.delete(perm);
      } else {
        next.add(perm);
      }
      return next;
    });
  };

  const handleSelectAllGroup = (perms: string[], enable: boolean) => {
    setEditPermissions(prev => {
      const next = new Set(prev);
      perms.forEach(p => {
        if (enable) next.add(p);
        else next.delete(p);
      });
      return next;
    });
  };

  const handleSavePermissions = async () => {
    setPermSaving(true);
    try {
      const updated = await api.updateRolePermissions(selectedRole, Array.from(editPermissions));
      setRoleConfigs(prev => prev.map(r => r.role === selectedRole ? updated : r));
      alert('Permissions updated successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to save permissions');
    } finally {
      setPermSaving(false);
    }
  };

  const handleResetPermissions = async () => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Reset "${selectedRole}" permissions to defaults?`)
      : await new Promise(resolve => {
          Alert.alert('Reset Permissions', `Reset "${selectedRole}" to defaults?`, [
            { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
            { text: 'Reset', onPress: () => resolve(true), style: 'destructive' }
          ]);
        });
    if (!confirmed) return;
    setPermSaving(true);
    try {
      const updated = await api.resetRolePermissions(selectedRole);
      setRoleConfigs(prev => prev.map(r => r.role === selectedRole ? updated : r));
      setEditPermissions(new Set(updated.permissions));
      alert('Permissions reset to defaults!');
    } catch (err: any) {
      alert(err.message || 'Failed to reset permissions');
    } finally {
      setPermSaving(false);
    }
  };

  // --- Create Role ---
  const handleCreateRole = async () => {
    if (!newRoleName.trim()) {
      setRoleModalError('Role name is required.');
      return;
    }
    setRoleModalSubmitting(true);
    setRoleModalError('');
    try {
      const created = await api.createRole({
        role: newRoleName.trim(),
        label: newRoleLabel.trim() || undefined,
        description: newRoleDesc.trim() || undefined,
      });
      setRoleConfigs(prev => [...prev, created]);
      setNewRoleName('');
      setNewRoleLabel('');
      setNewRoleDesc('');
      setIsRoleModalOpen(false);
      setSelectedRole(created.role);
      setEditPermissions(new Set(created.permissions));
    } catch (err: any) {
      setRoleModalError(err.message || 'Failed to create role.');
    } finally {
      setRoleModalSubmitting(false);
    }
  };

  // --- Delete Role ---
  const handleDeleteRole = async (role: string) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Delete role "${role}"? Users with this role will be reassigned to "agent". This cannot be undone.`)
      : await new Promise(resolve => {
          Alert.alert('Delete Role', `Delete "${role}"? Users will be reassigned to agent.`, [
            { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
            { text: 'Delete', onPress: () => resolve(true), style: 'destructive' }
          ]);
        });
    if (!confirmed) return;
    setDeletingRole(true);
    setDeleteConfirmRole(role);
    try {
      await api.deleteRole(role);
      setRoleConfigs(prev => prev.filter(r => r.role !== role));
      if (selectedRole === role) {
        const next = roleConfigs.find(r => r.role !== role);
        setSelectedRole(next ? next.role : 'agent');
        setEditPermissions(new Set(next ? next.permissions : []));
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete role');
    } finally {
      setDeletingRole(false);
      setDeleteConfirmRole(null);
    }
  };

  const filteredGrouped = searchPerm.trim()
    ? Object.fromEntries(
        Object.entries(groupedPermissions).map(([res, perms]) => [
          res,
          perms.filter(p => p.toLowerCase().includes(searchPerm.toLowerCase()))
        ]).filter(([_, perms]) => perms.length > 0)
      )
    : groupedPermissions;

  const availableRoles = roleConfigs.map(r => r.role);

  if (loading && activeTab === 'users') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading Access Controls...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Tab Bar */}
      <View style={styles.tabRow}>
        {(['users', 'permissions'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 3 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Ionicons
              name={tab === 'users' ? 'people-outline' : 'shield-checkmark-outline'}
              size={15}
              color={activeTab === tab ? colors.primary : colors.text.secondary}
            />
            <Text style={[styles.tabText, activeTab === tab && { color: colors.primary, fontWeight: '700' }]}>
              {tab === 'users' ? 'Users' : 'Role Permissions'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ================================================================ */}
        {/* TAB: USERS */}
        {/* ================================================================ */}
        {activeTab === 'users' && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitleText}>System User Directory</Text>
              <TouchableOpacity
                style={[styles.addButton, !isDesktop && { width: 32, height: 32, borderRadius: 16 }]}
                onPress={() => { setModalError(''); setIsUserModalOpen(true); }}
                activeOpacity={0.8}
              >
                <Ionicons name="person-add-outline" size={15} color="#fff" />
                {isDesktop && <Text style={styles.addButtonText}>Add User</Text>}
              </TouchableOpacity>
            </View>

            {users.map(item => (
              <View key={item._id} style={styles.userRow}>
                <View style={styles.userInfoCol}>
                  <View style={[styles.avatar, { borderColor: getRoleColor(item.role, colors) }]}>
                    <Text style={[styles.avatarText, { color: getRoleColor(item.role, colors) }]}>
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.userName}>{item.name}</Text>
                      <View style={[styles.roleBadge, { borderColor: getRoleColor(item.role, colors), backgroundColor: getRoleColor(item.role, colors) + '10' }]}>
                        <Text style={[styles.roleBadgeText, { color: getRoleColor(item.role, colors) }]}>{item.role.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={styles.userEmail}>{item.email}</Text>
                    {(() => {
                      const isOnline = item.lastActive
                        ? new Date().getTime() - new Date(item.lastActive).getTime() < 5 * 60 * 1000
                        : false;
                      return (
                        <View style={{ marginTop: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isOnline ? colors.success : '#999' }} />
                            <Text style={{ fontSize: 11, color: isOnline ? colors.success : colors.text.muted, fontWeight: isOnline ? '600' : '400' }}>
                              {isOnline ? 'Online' : 'Offline'}
                            </Text>
                            {item.lastActive && (
                              <Text style={{ fontSize: 10, color: colors.text.muted }}> • Active {formatTimeAgo(item.lastActive)}</Text>
                            )}
                          </View>
                        </View>
                      );
                    })()}
                  </View>
                </View>

                <View style={styles.actionsCol}>
                  <View style={styles.roleGroup}>
                    {availableRoles.map(roleOption => {
                      const isSelected = item.role === roleOption;
                      return (
                        <TouchableOpacity
                          key={roleOption}
                          style={[styles.roleOptionBtn, isSelected && { backgroundColor: getRoleColor(roleOption, colors) + '20', borderColor: getRoleColor(roleOption, colors) }]}
                          onPress={() => handleRoleChange(item._id, item.role, roleOption)}
                          disabled={actionLoading === item._id}
                        >
                          <Text style={[styles.roleOptionText, isSelected && { color: getRoleColor(roleOption, colors), fontWeight: '700' }]}>
                            {roleOption.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.cashToggleGroup}>
                    <Ionicons name={item.canAccessCash ? 'cash-outline' : 'lock-closed-outline'} size={14} color={item.canAccessCash ? colors.success : colors.text.muted} />
                    <Text style={[styles.cashToggleLabel, item.canAccessCash && { color: colors.success, fontWeight: '600' }]}>Cash</Text>
                    <Switch
                      value={item.canAccessCash}
                      onValueChange={(val) => handleCashToggle(item._id, val)}
                      disabled={actionLoading === item._id || item.role === 'admin'}
                      trackColor={{ false: colors.border, true: colors.success + '40' }}
                      thumbColor={item.canAccessCash ? colors.success : colors.text.muted}
                    />
                  </View>

                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteUser(item._id, item.name)} disabled={actionLoading === item._id}>
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
        )}

        {/* ================================================================ */}
        {/* TAB: PERMISSIONS */}
        {/* ================================================================ */}
        {activeTab === 'permissions' && (
          <View>
            {/* Role Selector */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitleText}>Granular Role Permissions</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.addButton, !isDesktop && { width: 32, height: 32, borderRadius: 16 }]}
                    onPress={() => { setRoleModalError(''); setIsRoleModalOpen(true); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-outline" size={15} color="#fff" />
                    {isDesktop && <Text style={styles.addButtonText}>New Role</Text>}
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12, lineHeight: 15 }}>
                Configure exactly what each role can access. Changes take effect immediately for all users with that role.
              </Text>
              <View style={styles.roleSelectorRow}>
                {roleConfigs.map(config => {
                  const role = config.role;
                  return (
                    <TouchableOpacity
                      key={role}
                      style={[
                        styles.roleSelectorBtn,
                        selectedRole === role && { backgroundColor: getRoleColor(role, colors) + '15', borderColor: getRoleColor(role, colors), borderWidth: 2 }
                      ]}
                      onPress={() => handleRoleSelect(role)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[
                          styles.roleSelectorText,
                          { color: selectedRole === role ? getRoleColor(role, colors) : colors.text.secondary },
                          selectedRole === role && { fontWeight: '800' }
                        ]}>
                          {config.label || role.toUpperCase()}
                        </Text>
                        {config.isCustom && (
                          <TouchableOpacity
                            onPress={() => handleDeleteRole(role)}
                            disabled={deletingRole}
                            style={{ padding: 2 }}
                          >
                            <Ionicons name="close-circle-outline" size={14} color={colors.text.muted} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={[styles.roleSelectorCount, { color: selectedRole === role ? getRoleColor(role, colors) : colors.text.muted }]}>
                        {config.permissions?.length || 0} perms
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Search */}
            <View style={[styles.card, { marginTop: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="search-outline" size={16} color={colors.text.muted} />
                <TextInput
                  style={{ flex: 1, fontSize: 13, color: colors.text.primary, paddingVertical: 4 }}
                  placeholder="Search permissions..."
                  placeholderTextColor={colors.text.muted}
                  value={searchPerm}
                  onChangeText={setSearchPerm}
                />
                <Text style={{ fontSize: 10, color: colors.text.muted }}>
                  {editPermissions.size}/{allPermissions.length} selected
                </Text>
              </View>
            </View>

            {/* Permission Matrix */}
            {permLoading ? (
              <View style={{ alignItems: 'center', padding: 40 }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <View style={{ gap: 8, marginTop: 12 }}>
                {Object.entries(filteredGrouped).map(([resource, perms]) => {
                  const allEnabled = perms.every(p => editPermissions.has(p));
                  const someEnabled = perms.some(p => editPermissions.has(p));
                  return (
                    <View key={resource} style={styles.permGroup}>
                      <TouchableOpacity
                        style={styles.permGroupHeader}
                        onPress={() => handleSelectAllGroup(perms, !allEnabled)}
                      >
                        <View style={[styles.checkbox, allEnabled ? styles.checkboxOn : someEnabled ? styles.checkboxPartial : styles.checkboxOff]}>
                          {allEnabled && <Ionicons name="checkmark" size={12} color="#fff" />}
                          {someEnabled && !allEnabled && <View style={{ width: 8, height: 2, backgroundColor: colors.text.muted, borderRadius: 1 }} />}
                        </View>
                        <Text style={styles.permResourceLabel}>{resource}</Text>
                        <Text style={styles.permCount}>{perms.filter(p => editPermissions.has(p)).length}/{perms.length}</Text>
                      </TouchableOpacity>
                      <View style={styles.permActionsRow}>
                        {perms.map(perm => {
                          const action = perm.split(':')[1];
                          const enabled = editPermissions.has(perm);
                          return (
                            <TouchableOpacity
                              key={perm}
                              style={[styles.permChip, enabled && styles.permChipOn]}
                              onPress={() => handleTogglePermission(perm)}
                            >
                              <Text style={[styles.permChipText, enabled && styles.permChipTextOn]}>{action}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 40 }}>
              <TouchableOpacity
                style={[styles.savePermBtn, { backgroundColor: colors.danger + '15', borderColor: colors.danger }]}
                onPress={handleResetPermissions}
                disabled={permSaving || BUILTIN_ROLES.includes(selectedRole) === false}
              >
                <Ionicons name="refresh-outline" size={16} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700' }}>Reset to Defaults</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.savePermBtn, { backgroundColor: colors.primary, borderColor: colors.primary, flex: 1 }]}
                onPress={handleSavePermissions}
                disabled={permSaving}
              >
                {permSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Save Permissions for {selectedRole.toUpperCase()}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Register User Modal */}
      <Modal visible={isUserModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsUserModalOpen(false)} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Register New User</Text>
              <TouchableOpacity onPress={() => setIsUserModalOpen(false)} style={styles.modalCloseBtn}>
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
              <TextInput style={styles.input} placeholder="Enter user name" placeholderTextColor={colors.text.muted} value={newName} onChangeText={setNewName} />
              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput style={styles.input} placeholder="Enter email address" placeholderTextColor={colors.text.muted} keyboardType="email-address" autoCapitalize="none" value={newEmail} onChangeText={setNewEmail} />
              <Text style={styles.inputLabel}>Initial Password</Text>
              <TextInput style={styles.input} placeholder="Enter account password" placeholderTextColor={colors.text.muted} secureTextEntry value={newPassword} onChangeText={setNewPassword} />
              <Text style={styles.inputLabel}>Assign System Role</Text>
              <View style={styles.modalRoleGroup}>
                {availableRoles.map(role => {
                  const isSel = newUserRole === role;
                  return (
                    <TouchableOpacity
                      key={role}
                      style={[styles.modalRoleBtn, isSel && { borderColor: getRoleColor(role, colors), backgroundColor: getRoleColor(role, colors) + '10' }]}
                      onPress={() => { setNewUserRole(role); if (role === 'admin') setNewCanAccessCash(true); }}
                    >
                      <View style={[styles.radioDot, isSel && { backgroundColor: getRoleColor(role, colors) }]} />
                      <Text style={[styles.modalRoleText, isSel && { color: getRoleColor(role, colors), fontWeight: '700' }]}>{role.toUpperCase()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.modalCashAccessRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.modalCashLabel}>Grant Cash Access</Text>
                  <Text style={styles.modalCashDesc}>Allows view/edit actions for cash transactions and ledger tabs.</Text>
                </View>
                <Switch value={newCanAccessCash} onValueChange={setNewCanAccessCash} disabled={newUserRole === 'admin'}
                  trackColor={{ false: colors.border, true: colors.success + '40' }} thumbColor={newCanAccessCash ? colors.success : colors.text.muted} />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsUserModalOpen(false)} disabled={modalSubmitting}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleCreateUser} disabled={modalSubmitting}>
                {modalSubmitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitBtnText}>Create Account</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create Role Modal */}
      <Modal visible={isRoleModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsRoleModalOpen(false)} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Custom Role</Text>
              <TouchableOpacity onPress={() => setIsRoleModalOpen(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            {roleModalError ? (
              <View style={styles.errorAlert}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.errorAlertText}>{roleModalError}</Text>
              </View>
            ) : null}

            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Role Name</Text>
              <TextInput style={styles.input} placeholder="e.g. supervisor, accountant" placeholderTextColor={colors.text.muted} value={newRoleName} onChangeText={setNewRoleName} autoCapitalize="none" />
              <Text style={styles.helpText}>Will be normalized to lowercase with underscores (e.g. "Sales Manager" → "sales_manager")</Text>
              <Text style={styles.inputLabel}>Display Label (optional)</Text>
              <TextInput style={styles.input} placeholder="e.g. Sales Manager" placeholderTextColor={colors.text.muted} value={newRoleLabel} onChangeText={setNewRoleLabel} />
              <Text style={styles.inputLabel}>Description (optional)</Text>
              <TextInput style={styles.input} placeholder="Describe what this role can do..." placeholderTextColor={colors.text.muted} value={newRoleDesc} onChangeText={setNewRoleDesc} />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsRoleModalOpen(false)} disabled={roleModalSubmitting}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleCreateRole} disabled={roleModalSubmitting}>
                {roleModalSubmitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitBtnText}>Create Role</Text>}
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
    screen: { flex: 1, backgroundColor: colors.bg.primary },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg.primary },
    loadingText: { marginTop: 12, fontSize: 14, color: colors.text.secondary, fontWeight: '600' },
    tabRow: { flexDirection: 'row', backgroundColor: colors.bg.secondary, borderBottomWidth: 1, borderBottomColor: colors.border },
    tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 6, borderBottomWidth: 3, borderBottomColor: 'transparent' },
    tabText: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
    addButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.md, gap: 4 },
    addButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    scrollContent: { padding: Spacing.lg },
    card: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.lg },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 10 },
    cardTitleText: { fontSize: 15, fontWeight: '800', color: colors.text.primary },
    userRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 16, position: 'relative', gap: 12 },
    userInfoCol: { flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 260, flex: 1 },
    avatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.02)' },
    avatarText: { fontSize: 16, fontWeight: '800' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
    userName: { fontSize: 14, fontWeight: '700', color: colors.text.primary },
    roleBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1.5 },
    roleBadgeText: { fontSize: 8, fontWeight: '800' },
    userEmail: { fontSize: 12, color: colors.text.secondary },
    actionsCol: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 20 },
    roleGroup: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: Radius.sm, overflow: 'hidden', flexWrap: 'wrap' },
    roleOptionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: 'rgba(0,0,0,0.01)' },
    roleOptionText: { fontSize: 9, fontWeight: '600', color: colors.text.muted },
    cashToggleGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cashToggleLabel: { fontSize: 11, color: colors.text.secondary },
    deleteBtn: { padding: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.danger + '20', backgroundColor: colors.danger + '08' },
    rowOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.6)', justifyContent: 'center', alignItems: 'center', borderRadius: Radius.md },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 },
    emptyText: { fontSize: 13, color: colors.text.muted, fontWeight: '600' },
    helpText: { fontSize: 10, color: colors.text.muted, marginTop: -12, marginBottom: 16, lineHeight: 14 },

    // --- Permission Styles ---
    roleSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    roleSelectorBtn: { alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.bg.secondary, minWidth: 100 },
    roleSelectorText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
    roleSelectorCount: { fontSize: 9, marginTop: 3 },
    permGroup: { backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    permGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    permResourceLabel: { fontSize: 13, fontWeight: '700', color: colors.text.primary, flex: 1, textTransform: 'capitalize' },
    permCount: { fontSize: 10, color: colors.text.muted, fontWeight: '600' },
    permActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 8 },
    permChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.primary },
    permChipOn: { backgroundColor: colors.primary + '15', borderColor: colors.primary },
    permChipText: { fontSize: 10, fontWeight: '600', color: colors.text.muted },
    permChipTextOn: { color: colors.primary, fontWeight: '700' },
    checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkboxPartial: { backgroundColor: 'transparent', borderColor: colors.text.muted },
    checkboxOff: { backgroundColor: 'transparent', borderColor: colors.border },
    savePermBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1.5 },

    // --- Modal Styles ---
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    modalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContainer: { width: '90%', maxWidth: 480, maxHeight: '90%', backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', elevation: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
    modalTitle: { fontSize: 16, fontWeight: '800', color: colors.text.primary },
    modalCloseBtn: { padding: 4 },
    modalForm: { padding: Spacing.lg },
    inputLabel: { fontSize: 11, fontWeight: '700', color: colors.text.secondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
    input: { backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text.primary, marginBottom: 16 },
    modalRoleGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
    modalRoleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.border, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 14 },
    modalRoleText: { fontSize: 10, fontWeight: '600', color: colors.text.secondary },
    radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.1)' },
    modalCashAccessRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderRadius: Radius.md, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
    modalCashLabel: { fontSize: 13, fontWeight: '700', color: colors.text.primary, marginBottom: 2 },
    modalCashDesc: { fontSize: 11, color: colors.text.muted, lineHeight: 14 },
    modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border, gap: 12, backgroundColor: colors.bg.secondary },
    cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border },
    cancelBtnText: { color: colors.text.secondary, fontSize: 13, fontWeight: '700' },
    submitBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', minWidth: 110 },
    submitBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    errorAlert: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.danger + '10', borderWidth: 1, borderColor: colors.danger + '30', borderRadius: Radius.md, marginHorizontal: Spacing.lg, marginTop: Spacing.md, padding: 10 },
    errorAlertText: { color: colors.danger, fontSize: 12, fontWeight: '600', flex: 1 },
  });