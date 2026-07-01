import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors, Shadows } from '../constants/theme';
import { api, Order } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'processing' | 'shipped' | 'delivered'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const load = useCallback(async () => {
    try {
      const data = await api.getOrders();
      setOrders(data);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', 'Failed to load orders: ' + err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleUpdateStatus = async (id: string, newStatus: 'pending' | 'processing' | 'shipped' | 'delivered') => {
    setActionLoading(id);
    try {
      await api.updateOrderStatus(id, newStatus);
      await load();
    } catch (err: any) {
      Alert.alert('Error', 'Failed to update order status: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesTab = activeTab === 'all' || o.status === activeTab;
    if (!matchesTab) return false;
    if (!search) return true;
    const lower = search.toLowerCase();
    return (
      o.name.toLowerCase().includes(lower) ||
      o.email.toLowerCase().includes(lower) ||
      o.phone.toLowerCase().includes(lower) ||
      o.shippingAddress.toLowerCase().includes(lower) ||
      o._id.toLowerCase().includes(lower)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return colors.danger;
      case 'processing': return colors.warning;
      case 'shipped': return colors.primary;
      case 'delivered': return colors.success;
      default: return colors.primary;
    }
  };

  return (
    <View style={styles.screen}>
      {/* Search & Tabs Topbar */}
      <View style={styles.topBar}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.text.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search orders by customer name, address, ID..."
            placeholderTextColor={colors.text.muted}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.text.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {(['all', 'pending', 'processing', 'shipped', 'delivered'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabBtnText, activeTab === tab && styles.tabBtnTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
            {tab !== 'all' && (
              <View style={[styles.badge, { backgroundColor: getStatusColor(tab) + '20' }]}>
                <Text style={[styles.badgeText, { color: getStatusColor(tab) }]}>
                  {orders.filter(o => o.status === tab).length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Orders List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {filteredOrders.map(o => (
          <View key={o._id} style={[styles.orderCard, { borderLeftColor: getStatusColor(o.status), borderLeftWidth: 4 }]}>
            {/* Header info */}
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderIdText} numberOfLines={1}>Order ID: {o._id}</Text>
                <Text style={styles.orderDate}>
                  {new Date(o.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(o.status) + '15', borderColor: getStatusColor(o.status) }]}>
                <Text style={[styles.statusBadgeText, { color: getStatusColor(o.status) }]}>
                  {o.status.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Customer Information */}
            <View style={styles.customerBox}>
              <Text style={styles.boxTitle}>Customer Details:</Text>
              <Text style={styles.customerName}>{o.name}</Text>
              <Text style={styles.customerContact}>📞 {o.phone}  |  ✉️ {o.email}</Text>
              <Text style={styles.customerAddress}>📍 {o.shippingAddress}</Text>
            </View>

            {/* Items table */}
            <View style={styles.itemsBox}>
              <Text style={styles.boxTitle}>Order Items:</Text>
              {o.items.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  <Text style={styles.itemNameText}>• {item.name} ({item.size})</Text>
                  <Text style={styles.itemQtyPriceText}>x{item.qty}  @  ₹{item.price}</Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total Payment:</Text>
                <Text style={styles.totalValue}>₹{o.totalAmount}</Text>
              </View>
            </View>

            {/* Footer Actions */}
            <View style={styles.cardActions}>
              {actionLoading === o._id ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 8 }} />
              ) : (
                <>
                  {o.status === 'pending' && (
                    <TouchableOpacity 
                      style={[styles.primaryActionBtn, { backgroundColor: colors.warning }]} 
                      onPress={() => handleUpdateStatus(o._id, 'processing')}
                    >
                      <Ionicons name="cog-outline" size={14} color="#fff" />
                      <Text style={styles.primaryActionBtnText}>Start Processing</Text>
                    </TouchableOpacity>
                  )}
                  {o.status === 'processing' && (
                    <TouchableOpacity 
                      style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]} 
                      onPress={() => handleUpdateStatus(o._id, 'shipped')}
                    >
                      <Ionicons name="airplane-outline" size={14} color="#fff" />
                      <Text style={styles.primaryActionBtnText}>Mark Shipped</Text>
                    </TouchableOpacity>
                  )}
                  {o.status === 'shipped' && (
                    <TouchableOpacity 
                      style={[styles.primaryActionBtn, { backgroundColor: colors.success }]} 
                      onPress={() => handleUpdateStatus(o._id, 'delivered')}
                    >
                      <Ionicons name="checkmark-done-circle" size={14} color="#fff" />
                      <Text style={styles.primaryActionBtnText}>Mark Delivered</Text>
                    </TouchableOpacity>
                  )}
                  {o.status === 'delivered' && (
                    <View style={styles.successLabel}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                      <Text style={styles.successLabelText}>Delivered successfully</Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        ))}

        {filteredOrders.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="cart-outline" size={48} color={colors.text.muted} />
            <Text style={styles.emptyTitle}>No Orders Found</Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'all' 
                ? 'No B2B orders have been placed yet.' 
                : `No orders with status "${activeTab}" found.`}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  topBar: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, height: '100%', color: colors.text.primary, fontSize: 14, marginLeft: 8 },
  tabsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border },
  tabBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabBtnText: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  tabBtnTextActive: { color: '#fff', fontWeight: '700' },
  badge: { marginLeft: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  orderCard: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: colors.border, ...Shadows.card },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  orderIdText: { fontSize: 14, fontWeight: '700', color: colors.text.primary, fontFamily: 'monospace' },
  orderDate: { fontSize: 11, color: colors.text.muted, marginTop: 2 },
  statusBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  statusBadgeText: { fontSize: 9, fontWeight: '800' },
  customerBox: { backgroundColor: colors.bg.primary, padding: 12, borderRadius: Radius.sm, marginBottom: 12 },
  boxTitle: { fontSize: 11, fontWeight: '700', color: colors.text.muted, marginBottom: 6, textTransform: 'uppercase' },
  customerName: { fontSize: 14, fontWeight: '700', color: colors.text.primary },
  customerContact: { fontSize: 12, color: colors.text.secondary, marginVertical: 3 },
  customerAddress: { fontSize: 12, color: colors.text.secondary },
  itemsBox: { backgroundColor: colors.bg.primary, padding: 12, borderRadius: Radius.sm, marginBottom: 12 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  itemNameText: { fontSize: 13, color: colors.text.primary, flex: 1 },
  itemQtyPriceText: { fontSize: 12, color: colors.text.secondary, marginLeft: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8, paddingTop: 8 },
  totalLabel: { fontSize: 13, fontWeight: '700', color: colors.text.primary },
  totalValue: { fontSize: 14, fontWeight: '800', color: colors.primary },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  primaryActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.sm },
  primaryActionBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  successLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  successLabelText: { color: colors.success, fontSize: 12, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', paddingVertical: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text.primary },
  emptySubtitle: { fontSize: 13, color: colors.text.muted, textAlign: 'center', paddingHorizontal: 20 },
});
