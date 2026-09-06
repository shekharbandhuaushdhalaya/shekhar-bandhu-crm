import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../utils/themeContext';
import { Spacing, Radius } from '../../../constants/theme';
import { MrpResponse, MrpSuggestion } from '../../../utils/api/types';

interface MRPPlanTabProps {
  mrpData: MrpResponse | null;
  loading: boolean;
  creatingPlan: boolean;
  isDesktop: boolean;
  onRefresh: () => void;
  onCreateProductionPlans: (productIds?: string[]) => void;
}

export default function MRPPlanTab({
  mrpData,
  loading,
  creatingPlan,
  isDesktop,
  onRefresh,
  onCreateProductionPlans
}: MRPPlanTabProps) {
  const { colors } = useTheme();
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleExpand = (rmId: string) => {
    setExpandedItems(prev => ({ ...prev, [rmId]: !prev[rmId] }));
  };

  const suggestions = mrpData?.suggestions || [];
  const generatedAt = mrpData?.generatedAt ? new Date(mrpData.generatedAt).toLocaleString('en-IN') : 'N/A';

  const totalItemsNeedingPurchase = suggestions.filter(s => s.suggestedPurchaseQty > 0).length;
  const totalProductionDrivenItems = suggestions.filter(s => s.requiredForProduction > 0).length;
  const totalSafetyStockItems = suggestions.filter(s => s.minReorderThreshold > s.currentAvailableStock).length;

  return (
    <View style={{ gap: Spacing.lg }}>
      {/* Header Banner */}
      <View style={[styles.card, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', justifyContent: 'space-between', alignItems: isDesktop ? 'center' : 'flex-start', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.iconBadge, { backgroundColor: colors.primary + '18' }]}>
              <Ionicons name="cart-outline" size={24} color={colors.primary} />
            </View>
            <View>
              <Text style={[styles.title, { color: colors.text.primary }]}>Material Requirements Plan (MRP)</Text>
              <Text style={[styles.subtitle, { color: colors.text.muted }]}>
                Derived from projected 3-month sales demand & standard BOM formulation ratios • Generated: {generatedAt}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, alignSelf: isDesktop ? 'auto' : 'stretch' }}>
            <TouchableOpacity
              style={[styles.btnOutline, { borderColor: colors.primary }]}
              onPress={onRefresh}
              disabled={loading}
            >
              <Ionicons name="refresh-outline" size={15} color={colors.primary} />
              <Text style={[styles.btnOutlineText, { color: colors.primary }]}>Refresh</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: colors.primary, opacity: creatingPlan ? 0.7 : 1 }]}
              onPress={() => onCreateProductionPlans()}
              disabled={creatingPlan || loading}
            >
              {creatingPlan ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="hammer-outline" size={15} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Create All Draft Plans</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Metric Cards */}
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
        <View style={[styles.metricCard, { flex: 1, backgroundColor: colors.bg.card, borderColor: colors.border }]}>
          <Text style={[styles.metricLabel, { color: colors.text.muted }]}>Items Needing Reorder</Text>
          <Text style={[styles.metricValue, { color: colors.primary }]}>{totalItemsNeedingPurchase}</Text>
          <Text style={[styles.metricSub, { color: colors.text.secondary }]}>Suggested purchase quantity &gt; 0</Text>
        </View>

        <View style={[styles.metricCard, { flex: 1, backgroundColor: colors.bg.card, borderColor: colors.border }]}>
          <Text style={[styles.metricLabel, { color: colors.text.muted }]}>Production-Driven Demand</Text>
          <Text style={[styles.metricValue, { color: colors.warning }]}>{totalProductionDrivenItems}</Text>
          <Text style={[styles.metricSub, { color: colors.text.secondary }]}>Driven by sales forecast shortfalls</Text>
        </View>

        <View style={[styles.metricCard, { flex: 1, backgroundColor: colors.bg.card, borderColor: colors.border }]}>
          <Text style={[styles.metricLabel, { color: colors.text.muted }]}>Safety Stock Shortfalls</Text>
          <Text style={[styles.metricValue, { color: colors.danger || '#dc3545' }]}>{totalSafetyStockItems}</Text>
          <Text style={[styles.metricSub, { color: colors.text.secondary }]}>Current stock &lt; Standing min reorder</Text>
        </View>
      </View>

      {/* Main Content Table */}
      {loading ? (
        <View style={[styles.card, { padding: 40, alignItems: 'center', backgroundColor: colors.bg.card, borderColor: colors.border }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 12, color: colors.text.secondary, fontSize: 13 }}>Calculating Material Requirements Plan...</Text>
        </View>
      ) : suggestions.length === 0 ? (
        <View style={[styles.card, { padding: 40, alignItems: 'center', backgroundColor: colors.bg.card, borderColor: colors.border }]}>
          <Ionicons name="checkmark-circle-outline" size={48} color={colors.success} />
          <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '700', color: colors.text.primary }}>Raw Material Stock Sufficient</Text>
          <Text style={{ marginTop: 4, color: colors.text.muted, fontSize: 13, textAlign: 'center' }}>
            No raw material purchase recommendations found. All current stocks satisfy projected production demand and safety stock thresholds.
          </Text>
        </View>
      ) : (
        <View style={[styles.card, { padding: 0, overflow: 'hidden', backgroundColor: colors.bg.card, borderColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={{ minWidth: 960 }}>
              {/* Table Header */}
              <View style={[styles.tableHeader, { backgroundColor: colors.bg.primary, borderBottomColor: colors.border }]}>
                <Text style={[styles.th, { flex: 2.2 }]}>RAW MATERIAL</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>PROD NEED</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>AVAIL STOCK</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>SAFETY STOCK</Text>
                <Text style={[styles.th, { flex: 1.5, textAlign: 'right' }]}>SUGGESTED PURCHASE</Text>
                <Text style={[styles.th, { flex: 2 }]}>PREFERRED VENDOR</Text>
                <Text style={[styles.th, { flex: 2, textAlign: 'center' }]}>ACTIONS</Text>
              </View>

              {/* Table Rows */}
              {suggestions.map((item: MrpSuggestion, idx: number) => {
                const isExpanded = !!expandedItems[item.rawMaterialId];
                const productIds = item.drivenByProducts.map(p => p.productId);

                return (
                  <View key={item.rawMaterialId} style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <View style={[styles.tableRow, idx % 2 === 1 && { backgroundColor: colors.bg.primary + '40' }]}>
                      {/* Raw Material Name & Details */}
                      <View style={{ flex: 2.2, paddingRight: 8 }}>
                        <Text style={{ fontWeight: '700', fontSize: 13, color: colors.text.primary }}>{item.rawMaterialName}</Text>
                        <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                          Unit: {item.unit} • Category: {item.category || 'General'}
                        </Text>
                      </View>

                      {/* Required for Production */}
                      <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.warning }}>
                          {item.requiredForProduction.toFixed(2)} {item.unit}
                        </Text>
                      </View>

                      {/* Current Available Stock */}
                      <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: item.currentAvailableStock > 0 ? colors.text.primary : colors.danger || '#dc3545' }}>
                          {item.currentAvailableStock.toFixed(2)} {item.unit}
                        </Text>
                      </View>

                      {/* Min Reorder Threshold */}
                      <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 13, color: colors.text.secondary }}>
                          {item.minReorderThreshold.toFixed(2)} {item.unit}
                        </Text>
                      </View>

                      {/* Suggested Purchase Qty */}
                      <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                        <View style={[styles.badge, { backgroundColor: item.suggestedPurchaseQty > 0 ? colors.success + '18' : colors.bg.primary }]}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: item.suggestedPurchaseQty > 0 ? colors.success : colors.text.muted }}>
                            {item.suggestedPurchaseQty.toFixed(2)} {item.unit}
                          </Text>
                        </View>
                      </View>

                      {/* Preferred Vendor */}
                      <View style={{ flex: 2, paddingHorizontal: 8 }}>
                        <Text style={{ fontSize: 12, color: colors.text.primary, fontWeight: '500' }}>
                          {item.preferredVendor.vendorName || 'Not Assigned'}
                        </Text>
                      </View>

                      {/* Actions */}
                      <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        {item.drivenByProducts.length > 0 && (
                          <TouchableOpacity
                            style={[styles.btnAction, { borderColor: colors.primary }]}
                            onPress={() => toggleExpand(item.rawMaterialId)}
                          >
                            <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>
                              {isExpanded ? 'Hide Products' : `Products (${item.drivenByProducts.length})`}
                            </Text>
                            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={colors.primary} />
                          </TouchableOpacity>
                        )}

                        {productIds.length > 0 && (
                          <TouchableOpacity
                            style={[styles.btnActionPrimary, { backgroundColor: colors.primary }]}
                            onPress={() => onCreateProductionPlans(productIds)}
                            disabled={creatingPlan}
                          >
                            <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700' }}>Plan Production</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {/* Expandable Accordion: Driven-By Products */}
                    {isExpanded && item.drivenByProducts.length > 0 && (
                      <View style={[styles.expandPanel, { backgroundColor: colors.bg.primary + '80', borderColor: colors.border }]}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.secondary, marginBottom: 6 }}>
                          PRODUCTS DRIVING THIS RAW MATERIAL SHORTFALL:
                        </Text>

                        {item.drivenByProducts.map((p, pIdx) => (
                          <View key={pIdx} style={styles.drivenRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="cube-outline" size={14} color={colors.primary} />
                              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.primary }}>{p.productName}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 16 }}>
                              <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                                Shortfall: <Text style={{ fontWeight: '700', color: colors.warning }}>{p.shortfallUnits} units</Text>
                              </Text>
                              <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                                Material Needed: <Text style={{ fontWeight: '700', color: colors.primary }}>{p.requiredQtyForProduct} {item.unit}</Text>
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  btnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  btnOutlineText: {
    fontSize: 12,
    fontWeight: '600',
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.sm,
  },
  btnPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  metricCard: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    marginVertical: 4,
  },
  metricSub: {
    fontSize: 11,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  th: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  btnAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  btnActionPrimary: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  expandPanel: {
    padding: Spacing.md,
    marginHorizontal: 14,
    marginBottom: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  drivenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  }
});
