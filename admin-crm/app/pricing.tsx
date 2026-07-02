import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, ActivityIndicator, Alert, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import { api, Product } from '../utils/api';
import { LightColors, Spacing, Radius, Shadows } from '../constants/theme';
import { useAuth } from '../utils/auth';

type PricingRow = {
  _id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  discount: number;
  discountLabel: string;
  websitePromoActive: boolean;
  // local edit state
  editPrice: string;
  editDiscount: string;
  editLabel: string;
  editPromo: boolean;
  dirty: boolean;
  saving: boolean;
};

export default function PricingScreen() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuth();

  const [rows, setRows] = useState<PricingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [saveAllLoading, setSaveAllLoading] = useState(false);

  const canEdit = user?.role === 'admin' || user?.role === 'manager';

  const fetchProducts = useCallback(async () => {
    try {
      const products: any[] = await api.getProducts();
      setRows(products.map(p => ({
        _id: p._id,
        name: p.name,
        sku: p.sku,
        category: p.category || 'General',
        price: p.price ?? 0,
        discount: p.discount ?? 0,
        discountLabel: p.discountLabel ?? '',
        websitePromoActive: p.websitePromoActive ?? false,
        editPrice: String(p.price ?? 0),
        editDiscount: String(p.discount ?? 0),
        editLabel: p.discountLabel ?? '',
        editPromo: p.websitePromoActive ?? false,
        dirty: false,
        saving: false,
      })));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load products');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const onRefresh = () => { setRefreshing(true); fetchProducts(); };

  const updateRow = (id: string, fields: Partial<PricingRow>) => {
    setRows(prev => prev.map(r => r._id === id ? { ...r, ...fields, dirty: true } : r));
  };

  const saveRow = async (row: PricingRow) => {
    if (!canEdit) return;
    const priceVal = parseFloat(row.editPrice);
    const discVal = parseFloat(row.editDiscount);
    if (isNaN(priceVal) || priceVal < 0) {
      Alert.alert('Invalid Price', 'Please enter a valid price (≥ 0).');
      return;
    }
    if (isNaN(discVal) || discVal < 0 || discVal > 100) {
      Alert.alert('Invalid Discount', 'Discount must be between 0 and 100.');
      return;
    }

    setRows(prev => prev.map(r => r._id === row._id ? { ...r, saving: true } : r));
    try {
      const updated = await (api as any).updateProductPricing(row._id, {
        price: priceVal,
        discount: discVal,
        discountLabel: row.editLabel,
        websitePromoActive: row.editPromo,
      });
      setRows(prev => prev.map(r => r._id === row._id ? {
        ...r,
        price: updated.price,
        discount: updated.discount ?? 0,
        discountLabel: updated.discountLabel ?? '',
        websitePromoActive: updated.websitePromoActive ?? false,
        editPrice: String(updated.price),
        editDiscount: String(updated.discount ?? 0),
        editLabel: updated.discountLabel ?? '',
        editPromo: updated.websitePromoActive ?? false,
        dirty: false,
        saving: false,
      } : r));
    } catch (e: any) {
      Alert.alert('Save Failed', e.message || 'Could not update pricing.');
      setRows(prev => prev.map(r => r._id === row._id ? { ...r, saving: false } : r));
    }
  };

  const saveAll = async () => {
    const dirtyRows = rows.filter(r => r.dirty);
    if (!dirtyRows.length) {
      Alert.alert('No Changes', 'No unsaved changes detected.');
      return;
    }
    setSaveAllLoading(true);
    for (const row of dirtyRows) await saveRow(row);
    setSaveAllLoading(false);
    Alert.alert('✅ Saved', `${dirtyRows.length} product(s) updated successfully.`);
  };

  const filteredRows = rows.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.sku.toLowerCase().includes(search.toLowerCase()) ||
    r.category.toLowerCase().includes(search.toLowerCase())
  );

  const dirtyCount = rows.filter(r => r.dirty).length;
  const activePromoCount = rows.filter(r => r.websitePromoActive).length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading products...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Page Header */}
      <View style={styles.pageHeader}>
        <View>
          <Text style={styles.pageTitle}>Pricing &amp; Discounts</Text>
          <Text style={styles.pageSubtitle}>Set rates and website promo banners for all products</Text>
        </View>
        {canEdit && (
          <TouchableOpacity
            style={[styles.saveAllBtn, saveAllLoading && { opacity: 0.7 }]}
            onPress={saveAll}
            disabled={saveAllLoading}
            activeOpacity={0.8}
          >
            {saveAllLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="save-outline" size={16} color="#fff" />}
            <Text style={styles.saveAllBtnText}>
              {saveAllLoading ? 'Saving...' : `Save All${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Stats Strip */}
      <View style={styles.statsStrip}>
        <View style={styles.statCard}>
          <Ionicons name="cube-outline" size={18} color={colors.primary} />
          <Text style={styles.statValue}>{rows.length}</Text>
          <Text style={styles.statLabel}>Total Products</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="pricetag-outline" size={18} color={colors.warning} />
          <Text style={styles.statValue}>{activePromoCount}</Text>
          <Text style={styles.statLabel}>Active Promos</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="pencil-outline" size={18} color={colors.success} />
          <Text style={styles.statValue}>{dirtyCount}</Text>
          <Text style={styles.statLabel}>Unsaved Changes</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color={colors.text.muted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, SKU or category..."
          placeholderTextColor={colors.text.muted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.text.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Column Headers */}
      <View style={styles.tableHeader}>
        <Text style={[styles.thCell, { flex: 2.5 }]}>Product</Text>
        <Text style={[styles.thCell, { flex: 1.2, textAlign: 'center' }]}>Price (₹)</Text>
        <Text style={[styles.thCell, { flex: 1, textAlign: 'center' }]}>Disc %</Text>
        <Text style={[styles.thCell, { flex: 1.8 }]}>Promo Label</Text>
        <Text style={[styles.thCell, { flex: 0.9, textAlign: 'center' }]}>Live</Text>
        <Text style={[styles.thCell, { flex: 0.8, textAlign: 'center' }]}>Save</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {filteredRows.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="pricetag-outline" size={40} color={colors.text.muted} />
            <Text style={styles.emptyText}>No products match your search.</Text>
          </View>
        ) : (
          filteredRows.map((row, idx) => (
            <View
              key={row._id}
              style={[
                styles.tableRow,
                idx % 2 === 0 && { backgroundColor: colors.bg.secondary },
                row.dirty && styles.tableRowDirty,
              ]}
            >
              {/* Product Info */}
              <View style={{ flex: 2.5 }}>
                <Text style={styles.productName} numberOfLines={1}>{row.name}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                  <Text style={styles.skuText}>{row.sku}</Text>
                  <View style={[styles.catBadge, { backgroundColor: colors.primary + '15' }]}>
                    <Text style={[styles.catBadgeText, { color: colors.primary }]}>{row.category}</Text>
                  </View>
                </View>
              </View>

              {/* Price */}
              <TextInput
                style={[styles.numInput, { flex: 1.2 }, !canEdit && styles.inputDisabled]}
                value={row.editPrice}
                onChangeText={v => updateRow(row._id, { editPrice: v })}
                keyboardType="decimal-pad"
                editable={canEdit}
                selectTextOnFocus
              />

              {/* Discount % */}
              <TextInput
                style={[styles.numInput, { flex: 1 }, !canEdit && styles.inputDisabled, row.editDiscount !== '0' && parseFloat(row.editDiscount) > 0 && styles.discountActive]}
                value={row.editDiscount}
                onChangeText={v => updateRow(row._id, { editDiscount: v })}
                keyboardType="decimal-pad"
                editable={canEdit}
                selectTextOnFocus
              />

              {/* Label */}
              <TextInput
                style={[styles.labelInput, { flex: 1.8 }, !canEdit && styles.inputDisabled]}
                value={row.editLabel}
                onChangeText={v => updateRow(row._id, { editLabel: v })}
                placeholder="e.g. Festive Sale"
                placeholderTextColor={colors.text.muted}
                editable={canEdit}
              />

              {/* Promo Toggle */}
              <View style={{ flex: 0.9, alignItems: 'center', justifyContent: 'center' }}>
                <Switch
                  value={row.editPromo}
                  onValueChange={v => { if (canEdit) updateRow(row._id, { editPromo: v }); }}
                  trackColor={{ false: colors.border, true: colors.success + '80' }}
                  thumbColor={row.editPromo ? colors.success : colors.text.muted}
                  disabled={!canEdit}
                />
              </View>

              {/* Save button */}
              <View style={{ flex: 0.8, alignItems: 'center', justifyContent: 'center' }}>
                {row.saving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <TouchableOpacity
                    style={[styles.saveRowBtn, !row.dirty && styles.saveRowBtnDisabled]}
                    onPress={() => saveRow(row)}
                    disabled={!row.dirty || !canEdit}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={row.dirty ? 'checkmark-circle' : 'checkmark-circle-outline'}
                      size={22}
                      color={row.dirty && canEdit ? colors.success : colors.text.muted}
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {!canEdit && (
        <View style={styles.readOnlyBanner}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.warning} />
          <Text style={styles.readOnlyText}>View-only mode. Only Admins and Managers can edit pricing.</Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.primary },
  loadingText: { marginTop: 12, color: colors.text.muted, fontSize: 14 },

  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg.secondary,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.3,
  },
  pageSubtitle: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  saveAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.md,
    ...Shadows.header,
  },
  saveAllBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  statsStrip: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    backgroundColor: colors.bg.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bg.primary,
    borderRadius: Radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { fontSize: 16, fontWeight: '800', color: colors.text.primary },
  statLabel: { fontSize: 10, color: colors.text.muted, flex: 1 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
    backgroundColor: colors.bg.secondary,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 14,
    paddingVertical: 0,
  },

  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    backgroundColor: colors.bg.primary,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  thCell: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 64,
    gap: 8,
  },
  tableRowDirty: {
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },

  productName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  skuText: {
    fontSize: 10,
    color: colors.text.muted,
    fontFamily: 'monospace',
  },
  catBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  catBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  numInput: {
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  discountActive: {
    borderColor: colors.warning,
    backgroundColor: colors.warning + '10',
    color: colors.warning,
  },
  labelInput: {
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: colors.text.primary,
  },
  inputDisabled: {
    opacity: 0.5,
  },

  saveRowBtn: { padding: 4 },
  saveRowBtnDisabled: { opacity: 0.3 },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: { color: colors.text.muted, fontSize: 14 },

  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.warning + '15',
    borderTopWidth: 1,
    borderTopColor: colors.warning + '40',
  },
  readOnlyText: { fontSize: 12, color: colors.warning, fontWeight: '600' },
});
