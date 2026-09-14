import ScreenHeader from '../components/ScreenHeader';
import { DataTable } from '../components/DataTable';
import { StatusPill, EmptyState } from './../components/WorkspacePrimitives';
import { AppTextInput as TextInput } from './../components/AppTextInput';
import { PressableOpacity as TouchableOpacity } from './../components/PressableOpacity';
import { AppText as Text } from './../components/AppText';
import { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, Alert, Modal, DeviceEventEmitter, Platform, useWindowDimensions, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Spacing, Radius, LightColors, Shadows, Typography } from '../constants/theme';
import { api, Order } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';
import { useToast } from '../utils/ToastContext';
import { useDebouncedValue } from '../utils/useDebouncedValue';

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'processing' | 'shipped' | 'delivered'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Detail Modal State
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Edit Order States
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCourierName, setEditCourierName] = useState('');
  const [editTrackingId, setEditTrackingId] = useState('');
  const [editCourierLink, setEditCourierLink] = useState('');
  const [editAdminNotes, setEditAdminNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;
  const { showToast } = useToast();
  const router = useRouter();

  const handleCreateChallan = (order: Order) => {
    setSelectedOrder(null);
    // Website orders are fulfilled from the Sales Workspace. The old
    // StockMovement screen is a read-only archive and cannot create Challans.
    router.push(`/sales-workspace?tab=orders&orderId=${encodeURIComponent(order._id)}`);
  };

  // Lazy loading state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 50;

  const load = useCallback(async () => {
    try {
      const res = await api.getOrders(page, limit);
      if (res && res.data) {
        if (page === 1) {
          setOrders(res.data);
        } else {
          setOrders(prev => {
            const existingIds = new Set(prev.map(o => o._id));
            const newOrders = res.data.filter((o: any) => !existingIds.has(o._id));
            return [...prev, ...newOrders];
          });
        }
        setTotalPages(res.totalPages || 1);
      } else {
        setOrders(Array.isArray(res) ? res : []);
        setTotalPages(1);
      }
    } catch (err: any) {
      console.error(err);
      showToast('Failed to load orders: ' + err.message, 'error');
    }
  }, [page]);

  useEffect(() => {
    load();
    const sub1 = DeviceEventEmitter.addListener('new_web_order_event', () => load());
    const sub2 = DeviceEventEmitter.addListener('inventory_updated_event', () => load());
    const sub3 = DeviceEventEmitter.addListener('order_updated_event', () => load());
    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    api.clearCache();
    await load();
    setRefreshing(false);
  }, [load]);

  const handleUpdateStatus = async (id: string, newStatus: 'pending' | 'processing') => {
    setActionLoading(id);
    try {
      await api.updateOrderStatus(id, newStatus);
      await load();
      if (selectedOrder && selectedOrder._id === id) {
        setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null);
      }
      showToast(`Order status updated to ${newStatus.toUpperCase()}`, 'success');
    } catch (err: any) {
      showToast('Failed to update order status: ' + err.message, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenEdit = (order: Order) => {
    setEditingOrder(order);
    setEditName(order.name);
    setEditEmail(order.email);
    setEditPhone(order.phone);
    setEditAddress(order.shippingAddress);
    setEditCourierName((order as any).courierName || '');
    setEditTrackingId((order as any).trackingId || '');
    setEditCourierLink((order as any).courierLink || '');
    setEditAdminNotes((order as any).adminNotes || '');
  };

  const handleSaveEdit = async () => {
    if (!editingOrder) return;
    if (!editName.trim() || !editEmail.trim() || !editPhone.trim() || !editAddress.trim()) {
      showToast('All customer detail fields are required.', 'error');
      return;
    }

    setSavingEdit(true);
    try {
      await (api as any).updateOrderDetails(editingOrder._id, {
        name: editName,
        email: editEmail,
        phone: editPhone,
        shippingAddress: editAddress,
        courierName: editCourierName,
        trackingId: editTrackingId,
        courierLink: editCourierLink,
        adminNotes: editAdminNotes
      });
      setEditingOrder(null);
      await load();
      if (selectedOrder && selectedOrder._id === editingOrder._id) {
        setSelectedOrder(prev => prev ? {
          ...prev,
          name: editName,
          email: editEmail,
          phone: editPhone,
          shippingAddress: editAddress,
          courierName: editCourierName,
          trackingId: editTrackingId,
          courierLink: editCourierLink,
          adminNotes: editAdminNotes
        } as any : null);
      }
      showToast('Order details updated successfully.', 'success');
    } catch (err: any) {
      showToast('Failed to save order details: ' + err.message, 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesTab = activeTab === 'all' || o.status === activeTab;
    if (!matchesTab) return false;
    if (!debouncedSearch) return true;
    const lower = debouncedSearch.toLowerCase();
    return (
      o.name.toLowerCase().includes(lower) ||
      o.email.toLowerCase().includes(lower) ||
      o.phone.toLowerCase().includes(lower) ||
      o.shippingAddress.toLowerCase().includes(lower) ||
      ((o as any).courierName && (o as any).courierName.toLowerCase().includes(lower)) ||
      ((o as any).trackingId && (o as any).trackingId.toLowerCase().includes(lower)) ||
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
      <ScreenHeader title="Orders" subtitle="Review customer orders, fulfillment and delivery status." />
      {/* Integrated Search & Filter Header */}
      <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xs }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.bg.card,
          paddingHorizontal: 12,
          paddingRight: 8,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 10,
          minHeight: 46
        }}>
          <Ionicons name="search" size={18} color={colors.text.muted} />
          <TextInput
            style={{ ...Typography.bodySm, flex: 1, height: 42, color: colors.text.primary, minWidth: 100 }}
            placeholder="Search orders by customer, tracking, address..."
            placeholderTextColor={colors.text.muted}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.text.muted} />
            </TouchableOpacity>
          ) : null}

          {/* Status Dropdown inside search bar */}
          {Platform.OS === 'web' ? (
            <select
              value={activeTab}
              onChange={(e: any) => setActiveTab(e.target.value)}
            style={{ ...Typography.bodySm, padding: '6px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, backgroundColor: colors.bg.secondary, color: colors.text.primary, fontWeight: '600', outline: 'none', minHeight: 44, height: 44, cursor: 'pointer' }}
            >
              <option value="all">All Statuses ({orders.length})</option>
              <option value="pending">Pending ({orders.filter(o => o.status === 'pending').length})</option>
              <option value="processing">Processing ({orders.filter(o => o.status === 'processing').length})</option>
              <option value="shipped">Shipped ({orders.filter(o => o.status === 'shipped').length})</option>
              <option value="delivered">Delivered ({orders.filter(o => o.status === 'delivered').length})</option>
            </select>
          ) : (
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.bg.secondary,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 6,
                paddingHorizontal: 10,
                minHeight: 44,
                height: 44,
                gap: 6
              }}
              onPress={() => {
                const opts = [
                  { label: `All Statuses (${orders.length})`, val: 'all' },
                  { label: `Pending (${orders.filter(o => o.status === 'pending').length})`, val: 'pending' },
                  { label: `Processing (${orders.filter(o => o.status === 'processing').length})`, val: 'processing' },
                  { label: `Shipped (${orders.filter(o => o.status === 'shipped').length})`, val: 'shipped' },
                  { label: `Delivered (${orders.filter(o => o.status === 'delivered').length})`, val: 'delivered' },
                ];
                Alert.alert('Filter Status', '', opts.map(o => ({
                  text: o.label,
                  onPress: () => setActiveTab(o.val as any)
                })));
              }}
            >
              <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.primary }}>
                {activeTab.toUpperCase()} ({activeTab === 'all' ? orders.length : orders.filter(o => o.status === activeTab).length})
              </Text>
              <Ionicons name="chevron-down" size={12} color={colors.text.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Orders Table Container */}
      <View style={{ flex: 1, padding: Spacing.lg, paddingBottom: 40 }}>
        <DataTable data={filteredOrders || []} columns={[]} keyExtractor={(item: any, index: number) => item._id || String(index)} minWidth={1100} embedded containerStyle={{ flex: 1, height: '100%' }} renderTableHeader={() => (<View style={styles.tableHeaderRow}>
              <View style={[styles.tableHeaderCellContainer, { width: 140 }]}>
                <Text style={styles.tableHeaderCell}>Order &amp; Date</Text>
              </View>
              <View style={[styles.tableHeaderCellContainer, { flex: 2, minWidth: 200 }]}>
                <Text style={styles.tableHeaderCell}>Customer</Text>
              </View>
              <View style={[styles.tableHeaderCellContainer, { flex: 1.2, minWidth: 140 }]}>
                <Text style={styles.tableHeaderCell}>Items</Text>
              </View>
              <View style={[styles.tableHeaderCellContainer, { width: 120 }]}>
                <Text style={styles.tableHeaderCell}>Amount</Text>
              </View>
              <View style={[styles.tableHeaderCellContainer, { width: 130 }]}>
                <Text style={styles.tableHeaderCell}>Status</Text>
              </View>
              <View style={[styles.tableHeaderCellContainer, { width: 200, borderRightWidth: 0 }]}>
                <Text style={styles.tableHeaderCell}>Action</Text>
              </View>
            </View>)} renderTableRow={o => {
              const statusColor = getStatusColor(o.status);
              return (
                <TouchableOpacity
                  key={o._id}
                  style={[
                    styles.tableBodyRow,
                    {
                      backgroundColor: statusColor + '0A',
                      borderLeftWidth: 4,
                      borderLeftColor: statusColor
                    }
                  ]}
                  onPress={() => setSelectedOrder(o)}
                >
                <View style={[styles.tableCellContainer, { width: 140 }]}>
                  <Text style={styles.orderIdText} numberOfLines={1}>#{o._id.slice(-6)}</Text>
                  <Text style={styles.orderDate}>{new Date(o.createdAt).toLocaleDateString('en-IN')}</Text>
                </View>

                <View style={[styles.tableCellContainer, { flex: 2, minWidth: 200 }]}>
                  <Text style={styles.primaryText} numberOfLines={1}>{o.name}</Text>
                  <Text style={styles.subText} numberOfLines={1}>Phone: {o.phone}</Text>
                </View>

                <View style={[styles.tableCellContainer, { flex: 1.2, minWidth: 140 }]}>
                  <Text style={styles.primaryText}>{o.items.length} {o.items.length === 1 ? 'Item' : 'Items'}</Text>
                  <Text style={styles.subText} numberOfLines={1}>{o.items.map(i => i.name).join(', ')}</Text>
                </View>

                <View style={[styles.tableCellContainer, { width: 120 }]}>
                  <Text style={[styles.primaryText, { color: colors.success, fontWeight: '800' }]}>₹{(o.totalAmount || 0).toLocaleString('en-IN')}</Text>
                </View>

                <View style={[styles.tableCellContainer, { width: 130 }]}>
                  <StatusPill  label={<>
                      {o.status.toUpperCase()}
                    </>} textStyle={[styles.statusBadgeText, { color: getStatusColor(o.status) }]} />
                </View>

                <View style={[styles.tableCellContainer, { width: 200, borderRightWidth: 0, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'flex-start' }]}>
                  <TouchableOpacity
                    style={[styles.actionPillBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
                    onPress={() => setSelectedOrder(o)}
                  >
                    <Ionicons name="eye-outline" size={13} color={colors.primary} />
                    <Text style={[styles.actionPillText, { color: colors.primary }]}>View</Text>
                  </TouchableOpacity>

                  {o.status === 'pending' && (
                    <TouchableOpacity
                      style={[styles.actionPillBtn, { backgroundColor: colors.warning + '15', borderColor: colors.warning }]}
                      onPress={() => handleUpdateStatus(o._id, 'processing')}
                    >
                      <Ionicons name="cog-outline" size={13} color={colors.warning} />
                      <Text style={[styles.actionPillText, { color: colors.warning }]}>Process</Text>
                    </TouchableOpacity>
                  )}

                  {o.hasChallan ? (
                    <View style={[styles.actionPillBtn, { backgroundColor: colors.bg.secondary, borderColor: colors.border, maxWidth: 110 }]}>
                      <Ionicons name="checkmark-done" size={13} color={colors.text.muted} />
                      <Text style={[styles.actionPillText, { color: colors.text.muted, flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">{o.challanNo || 'Challan'}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.actionPillBtn, { backgroundColor: colors.infoLight, borderColor: colors.info }]}
                      onPress={() => handleCreateChallan(o)}
                    >
                      <Ionicons name="document-attach-outline" size={13} color={colors.info} />
                      <Text style={[styles.actionPillText, { color: colors.info }]}>Challan</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          }} isRefreshing={refreshing} onRefresh={onRefresh} onLoadMore={() => { if (page < totalPages) setPage(p => p + 1); }} ListEmptyComponent={<EmptyState title={<>No Orders Found</>} message={<>{activeTab === 'all' ? 'No B2B orders have been placed yet.' : `No orders with status "${activeTab}" found.`}</>} />} />
      </View>

      {/* Order Detail Modal Drawer */}
      {selectedOrder && (
        <Modal
          visible={selectedOrder !== null}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setSelectedOrder(null)}
        >
          <View style={[styles.modalOverlay, !isDesktop && styles.modalOverlayMobile]}>
            <View style={[styles.modalContent, { maxWidth: 650 }, !isDesktop && styles.modalContentMobile]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Order Details: #{selectedOrder._id}</Text>
                  <Text style={{ ...Typography.caption, color: colors.text.muted }}>
                    Placed on {new Date(selectedOrder.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedOrder(null)}>
                  <Ionicons name="close" size={22} color={colors.text.primary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ padding: Spacing.lg }} contentContainerStyle={{ gap: 12 }}>
                {/* Status Bar */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg.primary, padding: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <View>
                    <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.secondary }}>ORDER STATUS</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                      <Ionicons name="business-outline" size={13} color={colors.primary} />
                      <Text style={{ ...Typography.eyebrow, color: colors.primary, fontWeight: '700' }}>
                        Routed to: {(selectedOrder as any).paymentMethod === 'COD' ? 'Courier COD Clearing' : 'Razorpay Online Clearing'}
                      </Text>
                    </View>
                  </View>
                  <StatusPill  label={<>
                      {selectedOrder.status.toUpperCase()}
                    </>} textStyle={[styles.statusBadgeText, { color: getStatusColor(selectedOrder.status) }]} />
                </View>

                {/* Customer Details Card */}
                <View style={styles.customerBox}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={styles.boxTitle}>Customer Contact Details</Text>
                    <TouchableOpacity style={styles.editBtn} onPress={() => { handleOpenEdit(selectedOrder); }}>
                      <Ionicons name="pencil-outline" size={13} color={colors.primary} />
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.customerName}>{selectedOrder.name}</Text>
                  <Text style={styles.customerContact}>Phone: {selectedOrder.phone}  |  Email: {selectedOrder.email}</Text>
                  <Text style={styles.customerAddress}>Address: {selectedOrder.shippingAddress}</Text>
                </View>

                {/* Logistics & Tracking */}
                {((selectedOrder as any).courierName || (selectedOrder as any).trackingId || (selectedOrder as any).adminNotes) ? (
                  <View style={styles.courierBox}>
                    <Text style={styles.boxTitle}>Courier &amp; Delivery Tracking Details</Text>
                    {(selectedOrder as any).courierName ? <Text style={styles.courierInfoText}>Courier Service: <Text style={{ fontWeight: '700' }}>{(selectedOrder as any).courierName}</Text></Text> : null}
                    {(selectedOrder as any).trackingId ? <Text style={styles.courierInfoText}>Tracking / AWB No: <Text style={{ fontWeight: '700', fontFamily: 'monospace' }}>{(selectedOrder as any).trackingId}</Text></Text> : null}
                    {(selectedOrder as any).courierLink ? <Text style={[styles.courierInfoText, { color: colors.primary }]} numberOfLines={1}>Link: {(selectedOrder as any).courierLink}</Text> : null}
                    {(selectedOrder as any).adminNotes ? <Text style={[styles.courierInfoText, { fontStyle: 'italic', color: colors.text.secondary, marginTop: 4 }]}>Notes: {(selectedOrder as any).adminNotes}</Text> : null}
                  </View>
                ) : null}

                {/* Items Breakdown */}
                <View style={styles.itemsBox}>
                  <Text style={styles.boxTitle}>Ordered Items Breakdown</Text>
                  {selectedOrder.items.map((item, index) => (
                    <View key={index} style={styles.itemRow}>
                      <Text style={styles.itemNameText}>• {item.name} ({item.size})</Text>
                      <Text style={styles.itemQtyPriceText}>x{item.qty}  @  ₹{item.price}</Text>
                    </View>
                  ))}
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total Payment Amount:</Text>
                    <Text style={styles.totalValue}>₹{(selectedOrder.totalAmount || 0).toLocaleString('en-IN')}</Text>
                  </View>
                </View>

                {/* Quick Process Actions */}
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                  {selectedOrder.hasChallan ? (
                    <View style={[styles.primaryActionBtn, { backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, flex: 1 }]}>
                      <Ionicons name="checkmark-done" size={14} color={colors.text.muted} />
                      <Text style={[styles.primaryActionBtnText, { color: colors.text.muted }]}>Challan Created ({selectedOrder.challanNo})</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.primaryActionBtn, { backgroundColor: colors.info, flex: 1 }]}
                      onPress={() => handleCreateChallan(selectedOrder)}
                    >
                      <Ionicons name="document-attach-outline" size={14} color="#fff" />
                      <Text style={styles.primaryActionBtnText}>Create Challan</Text>
                    </TouchableOpacity>
                  )}

                  {selectedOrder.hasInvoice ? (
                    <View style={[styles.primaryActionBtn, { backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, flex: 1 }]}>
                      <Ionicons name="checkmark-done" size={14} color={colors.text.muted} />
                      <Text style={[styles.primaryActionBtnText, { color: colors.text.muted }]}>Invoice Created ({selectedOrder.invoiceNo})</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.primaryActionBtn, { backgroundColor: colors.info, flex: 1 }]}
                      onPress={() => { setSelectedOrder(null); router.push('/sales-workspace?tab=challans'); }}
                    >
                      <Ionicons name="document-text-outline" size={14} color="#fff" />
                      <Text style={styles.primaryActionBtnText}>{selectedOrder.hasChallan ? 'Create Invoice from Challan' : 'Invoice follows Challan'}</Text>
                    </TouchableOpacity>
                  )}

                  {selectedOrder.status === 'pending' && (
                    <TouchableOpacity
                      style={[styles.primaryActionBtn, { backgroundColor: colors.warning, flex: 1 }]}
                      onPress={() => handleUpdateStatus(selectedOrder._id, 'processing')}
                    >
                      <Ionicons name="cog-outline" size={14} color="#fff" />
                      <Text style={styles.primaryActionBtnText}>Start Processing</Text>
                    </TouchableOpacity>
                  )}
                  {selectedOrder.status === 'processing' && (
                    <View style={[styles.primaryActionBtn, { backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, flex: 1 }]}> 
                      <Ionicons name="airplane-outline" size={14} color={colors.text.muted} />
                      <Text style={[styles.primaryActionBtnText, { color: colors.text.muted }]}>Shipment status is controlled by Dispatch</Text>
                    </View>
                  )}
                  {selectedOrder.status === 'shipped' && (
                    <View style={[styles.primaryActionBtn, { backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, flex: 1 }]}> 
                      <Ionicons name="checkmark-done-circle-outline" size={14} color={colors.text.muted} />
                      <Text style={[styles.primaryActionBtnText, { color: colors.text.muted }]}>Delivery status is controlled by Dispatch</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Edit Details Modal */}
      <Modal
        visible={editingOrder !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditingOrder(null)}
      >
        <View style={[styles.modalOverlay, !isDesktop && styles.modalOverlayMobile]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.modalContent, !isDesktop && styles.modalContentMobile]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Order Details</Text>
              <TouchableOpacity onPress={() => setEditingOrder(null)}>
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.sectionHeaderTitle}>Customer Contact Info</Text>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Customer Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Customer Name"
                  placeholderTextColor={colors.text.muted}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  style={styles.textInput}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="Phone Number"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Email Address</Text>
                <TextInput
                  style={styles.textInput}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="Email"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Shipping Address</Text>
                <TextInput
                  style={[styles.textInput, { height: 60, textAlignVertical: 'top', paddingTop: 10 }]}
                  value={editAddress}
                  onChangeText={setEditAddress}
                  placeholder="Shipping Address"
                  placeholderTextColor={colors.text.muted}
                  multiline
                />
              </View>

              <Text style={[styles.sectionHeaderTitle, { marginTop: 10 }]}>Courier &amp; Delivery Tracking</Text>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Courier Service Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={editCourierName}
                  onChangeText={setEditCourierName}
                  placeholder="e.g. BlueDart, Delhivery, DTDC"
                  placeholderTextColor={colors.text.muted}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Tracking ID / AWB Number</Text>
                <TextInput
                  style={styles.textInput}
                  value={editTrackingId}
                  onChangeText={setEditTrackingId}
                  placeholder="AWB Tracking Number"
                  placeholderTextColor={colors.text.muted}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Courier Tracking URL Link</Text>
                <TextInput
                  style={styles.textInput}
                  value={editCourierLink}
                  onChangeText={setEditCourierLink}
                  placeholder="e.g. https://track.delhivery.com/..."
                  placeholderTextColor={colors.text.muted}
                  keyboardType="url"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Internal Admin Notes</Text>
                <TextInput
                  style={[styles.textInput, { height: 60, textAlignVertical: 'top', paddingTop: 10 }]}
                  value={editAdminNotes}
                  onChangeText={setEditAdminNotes}
                  placeholder="Admin comments/delivery details..."
                  placeholderTextColor={colors.text.muted}
                  multiline
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setEditingOrder(null)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn]}
                onPress={handleSaveEdit}
                disabled={savingEdit}
              >
                {savingEdit ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },

  // Table styles
  table: { flex: 1, width: '100%', backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  tableHeaderCell: { ...Typography.caption, fontWeight: '800', color: colors.text.muted, textTransform: 'uppercase' },
  tableHeaderCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  tableBodyRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  tableCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center' },
  
  primaryText: { ...Typography.bodySm, fontWeight: '700', color: colors.text.primary },
  subText: { ...Typography.caption, color: colors.text.muted, marginTop: 2 },
  orderIdText: { ...Typography.bodySm, fontWeight: '800', color: colors.text.primary },
  orderDate: { ...Typography.caption, color: colors.text.muted, marginTop: 2 },

  statusBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignItems: 'center' },
  statusBadgeText: { ...Typography.eyebrow, fontWeight: '800' },
  
  actionPillBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  actionPillText: { ...Typography.caption, fontWeight: '700' },

  customerBox: { backgroundColor: colors.bg.primary, padding: 12, borderRadius: Radius.sm, marginBottom: 4 },
  boxTitle: { ...Typography.caption, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', marginBottom: 4 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtnText: { ...Typography.caption, fontWeight: '700', color: colors.primary },
  customerName: { ...Typography.body, fontWeight: '700', color: colors.text.primary },
  customerContact: { ...Typography.bodySm, color: colors.text.secondary, marginVertical: 3 },
  customerAddress: { ...Typography.bodySm, color: colors.text.secondary },

  courierBox: { backgroundColor: colors.bg.primary, padding: 12, borderRadius: Radius.sm, marginBottom: 4, borderLeftWidth: 3, borderLeftColor: colors.warning },
  courierInfoText: { ...Typography.bodySm, color: colors.text.primary, marginVertical: 2 },

  itemsBox: { backgroundColor: colors.bg.primary, padding: 12, borderRadius: Radius.sm, marginBottom: 4 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  itemNameText: { ...Typography.bodySm, color: colors.text.primary, flex: 1 },
  itemQtyPriceText: { ...Typography.bodySm, color: colors.text.secondary, marginLeft: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8, paddingTop: 8 },
  totalLabel: { ...Typography.bodySm, fontWeight: '700', color: colors.text.primary },
  totalValue: { ...Typography.body, fontWeight: '800', color: colors.primary },
  
  primaryActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.sm },
  primaryActionBtnText: { ...Typography.bodySm, color: '#fff', fontWeight: '700' },

  emptyContainer: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { ...Typography.h3, fontWeight: '800', color: colors.text.primary },
  emptySubtitle: { ...Typography.bodySm, color: colors.text.muted, textAlign: 'center', paddingHorizontal: 20 },

  // Edit Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  modalOverlayMobile: { justifyContent: 'flex-end', alignItems: 'stretch', padding: 0 },
  modalContent: { backgroundColor: colors.bg.card, width: '100%', maxWidth: 500, maxHeight: '90%', borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...Shadows.hover },
  modalContentMobile: { maxWidth: '100%', maxHeight: '85%', borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { ...Typography.h3, fontWeight: '800', color: colors.text.primary },
  modalBody: { padding: Spacing.lg, gap: Spacing.md },
  sectionHeaderTitle: { ...Typography.bodySm, fontWeight: '800', color: colors.primary, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 4, textTransform: 'uppercase' },
  formGroup: { gap: 4 },
  inputLabel: { ...Typography.caption, fontWeight: '700', color: colors.text.secondary },
  textInput: { ...Typography.body, backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, minHeight: 44, height: 44, color: colors.text.primary },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg.primary + '30' },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border },
  cancelBtnText: { ...Typography.bodySm, color: colors.text.secondary, fontWeight: '700' },
  saveBtn: { backgroundColor: colors.primary },
  saveBtnText: { ...Typography.bodySm, color: '#fff', fontWeight: '700' },
});
