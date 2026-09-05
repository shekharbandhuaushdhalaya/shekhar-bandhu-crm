import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { createStyles } from '../manufacturingStyles';

interface Props {
  expiryAlerts: any[];
  manufacturingUnits: any[];
  mfgUnitFilter: string;
  setMfgUnitFilter: (v: string) => void;
  materialSearch: string;
  setMaterialSearch: (v: string) => void;
  stockFilter: 'all' | 'low' | 'in_stock';
  setStockFilter: (v: 'all' | 'low' | 'in_stock') => void;
  filteredMaterials: any[];
  isDesktop: boolean;
  isIntegerQty: (unit: string, category: string) => boolean;
  onEditMaterial: (rm: any) => void;
  onTraceMaterial: (rm: any) => void;
}

const RawMaterialsTab = React.memo(function RawMaterialsTab({
  expiryAlerts, manufacturingUnits, mfgUnitFilter, setMfgUnitFilter,
  materialSearch, setMaterialSearch, stockFilter, setStockFilter,
  filteredMaterials, isDesktop, isIntegerQty, onEditMaterial, onTraceMaterial
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.tabContent}>
      {/* Expiry Alerts Warning Card */}
      {expiryAlerts.length > 0 && (
        <View style={[styles.card, { borderColor: colors.danger, backgroundColor: colors.danger + '08', marginBottom: 16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Ionicons name="warning" size={18} color={colors.danger} />
            <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '800' }}>
              Near Expiry Warning ({expiryAlerts.length} Batches)
            </Text>
          </View>
          {expiryAlerts.map(alert => (
            <View key={alert._id} style={{ paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.text.primary }}>
                🌿 {alert.rawMaterialId && typeof alert.rawMaterialId === 'object' ? alert.rawMaterialId.name : 'Unknown Material'}
              </Text>
              <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                Batch: <Text style={{ fontWeight: '700' }}>{alert.batchNo}</Text> • Stock: {(() => {
                  const r = alert.rawMaterialId && typeof alert.rawMaterialId === 'object' ? alert.rawMaterialId : null;
                  return r && isIntegerQty(r.unit, r.category) ? alert.qty.toFixed(0) : alert.qty.toFixed(2);
                })()} {alert.rawMaterialId && typeof alert.rawMaterialId === 'object' ? alert.rawMaterialId.unit : ''} • Expires on: <Text style={{ color: colors.danger, fontWeight: '700' }}>{new Date(alert.expiryDate!).toLocaleDateString()}</Text>
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Single Unified Raw Material Stock & Batch Breakdown List */}
      <View style={[styles.card, { padding: 10 }]}>
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', justifyContent: 'space-between', alignItems: isDesktop ? 'center' : 'stretch', gap: 8, marginBottom: 12 }}>
          <Text style={[styles.cardSubTitle, { marginBottom: 0 }]}>Raw Stocks & Reorder Status (Click to view active batches)</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Manufacturing Unit Filter Dropdown */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Ionicons name="business" size={14} color={colors.text.muted} style={{ marginRight: 4 }} />
              {Platform.OS === 'web' ? (
                <select
                  value={mfgUnitFilter}
                  onChange={(e: any) => setMfgUnitFilter(e.target.value)}
                  style={{
                    borderWidth: 0,
                    backgroundColor: 'transparent',
                    color: colors.text.primary,
                    fontSize: 11,
                    fontWeight: '600',
                    outlineWidth: 0,
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">All Units</option>
                  {manufacturingUnits.map(unit => (
                    <option key={unit._id} value={unit._id}>{unit.name}</option>
                  ))}
                </select>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    const options = ['all', ...manufacturingUnits.map(u => u._id)];
                    const currentIdx = options.indexOf(mfgUnitFilter);
                    const nextIdx = (currentIdx + 1) % options.length;
                    setMfgUnitFilter(options[nextIdx]);
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text.primary }}>
                    {mfgUnitFilter === 'all' ? 'All Units' : (manufacturingUnits.find(u => u._id === mfgUnitFilter)?.name || 'Unit')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Search Stocks Box */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, width: isDesktop ? 220 : undefined }}>
              <Ionicons name="search-outline" size={14} color={colors.text.muted} style={{ marginRight: 4 }} />
              <TextInput
                style={{ flex: 1, fontSize: 12, color: colors.text.primary, padding: 0 }}
                placeholder="Search stocks..."
                placeholderTextColor={colors.text.muted}
                value={materialSearch}
                onChangeText={setMaterialSearch}
              />
              {materialSearch.length > 0 && (
                <TouchableOpacity onPress={() => setMaterialSearch('')} style={{ marginRight: 6 }}>
                  <Ionicons name="close-circle" size={14} color={colors.text.muted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Stock Status Filter Dropdown */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Ionicons name="funnel-outline" size={12} color={colors.text.muted} style={{ marginRight: 4 }} />
              {Platform.OS === 'web' ? (
                <select
                  value={stockFilter}
                  onChange={(e: any) => setStockFilter(e.target.value)}
                  style={{
                    borderWidth: 0,
                    backgroundColor: 'transparent',
                    color: colors.text.primary,
                    fontSize: 11,
                    fontWeight: '600',
                    outlineWidth: 0,
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">All Stocks</option>
                  <option value="low">Low Stock</option>
                  <option value="in_stock">In Stock</option>
                </select>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    const nextFilter = stockFilter === 'all' ? 'low' : (stockFilter === 'low' ? 'in_stock' : 'all');
                    setStockFilter(nextFilter);
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text.primary }}>
                    {stockFilter === 'all' ? 'All Stocks' : (stockFilter === 'low' ? 'Low Stock' : 'In Stock')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, backgroundColor: colors.bg.secondary, borderTopLeftRadius: 6, borderTopRightRadius: 6 }}>
            <Text style={{ flex: 2, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Material (SKU)</Text>
            <Text style={{ flex: 1.2, fontSize: 10, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Stock</Text>
            <Text style={{ flex: 1.2, fontSize: 10, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Min</Text>
            <Text style={{ width: 140, fontSize: 10, fontWeight: '700', color: colors.text.secondary, textAlign: 'center' }}>Actions</Text>
          </View>
          {/* Body */}
          {filteredMaterials.map((rm, idx) => {
            const lowStock = (rm.stockLevel || 0) < rm.minReorder;

            return (
              <View key={rm._id} style={{ borderBottomWidth: idx === filteredMaterials.length - 1 ? 0 : 0.5, borderBottomColor: colors.border, paddingVertical: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8 }}>
                  <View style={{ flex: 2, paddingLeft: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{rm.name}</Text>
                      <View style={{ backgroundColor: colors.bg.secondary, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, borderWidth: 0.5, borderColor: colors.border }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: colors.text.secondary }}>
                          {rm.category === 'Packaging' ? '📦 Pkg' : (rm.category === 'Excipient' ? '💧 Base' : (rm.category === 'General' ? '⚙️ Gen' : '🌿 ' + (rm.category || 'Herb')))}
                        </Text>
                      </View>
                      {rm.pharmacopoeialStandard ? (
                        <View style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, borderWidth: 0.5, borderColor: colors.primary + '40' }}>
                          <Text style={{ fontSize: 8.5, fontWeight: '800', color: colors.primary }}>{rm.pharmacopoeialStandard}</Text>
                        </View>
                      ) : null}
                      {rm.isScheduleE1 ? (
                        <View style={{ backgroundColor: colors.danger + '15', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, borderWidth: 0.5, borderColor: colors.danger }}>
                          <Text style={{ fontSize: 8.5, fontWeight: '800', color: colors.danger }}>⚠️ Schedule E1 Poison</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                      {rm.botanicalName ? (
                        <Text style={{ fontSize: 10.5, fontStyle: 'italic', color: colors.text.secondary }}>
                          {rm.botanicalName}
                        </Text>
                      ) : null}
                      {rm.partUsed ? (
                        <Text style={{ fontSize: 9.5, fontWeight: '600', color: colors.primary }}>
                          Part: {rm.partUsed}
                        </Text>
                      ) : null}
                      {rm.sku ? <Text style={{ fontSize: 9.5, color: colors.text.muted }}>SKU: {rm.sku}</Text> : null}
                    </View>
                  </View>
                  <Text style={{ flex: 1.2, fontSize: 13, fontWeight: '700', color: lowStock ? colors.danger : colors.text.primary, textAlign: 'right' }}>
                    {rm.stockLevel !== undefined ? (isIntegerQty(rm.unit, rm.category) ? rm.stockLevel.toFixed(0) : rm.stockLevel.toFixed(1)) : (isIntegerQty(rm.unit, rm.category) ? '0' : '0.0')} {rm.unit}
                  </Text>
                  <Text style={{ flex: 1.2, fontSize: 11, color: colors.text.secondary, textAlign: 'right' }}>
                    {rm.minReorder} {rm.unit}
                  </Text>
                  <View style={{ width: 140, flexDirection: 'row', justifyContent: 'center', gap: 6, alignItems: 'center' }}>
                    <TouchableOpacity
                      onPress={() => onEditMaterial(rm)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, backgroundColor: colors.primary + '10', borderWidth: 0.5, borderColor: colors.primary + '30' }}
                    >
                      <Ionicons name="pencil-outline" size={13} color={colors.primary} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onTraceMaterial(rm)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, backgroundColor: colors.success + '10', borderWidth: 0.5, borderColor: colors.success + '30' }}
                    >
                      <Ionicons name="list-outline" size={13} color={colors.success} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.success }}>Ledger</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
        {filteredMaterials.length === 0 && <Text style={styles.emptyText}>No matching materials found.</Text>}
      </View>
    </View>
  );
});
export default RawMaterialsTab;
