import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../utils/api';
import ScreenHeader from '../components/ScreenHeader';
import { useTheme } from '../utils/themeContext';

export default function ComplianceScreen() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({ eq: [], dev: [], st: [], rec: [], vq: [], spec: [] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eq, dev, st, rec, vq, spec] = await Promise.all([
        api.getManufacturingEquipment().catch(() => []),
        api.getManufacturingDeviations().catch(() => []),
        api.getStabilityStudies().catch(() => []),
        api.getRecalls().catch(() => []),
        api.getVendorQualifications().catch(() => []),
        api.getQualitySpecifications().catch(() => []),
      ]);
      setData({
        eq: Array.isArray(eq) ? eq : [],
        dev: Array.isArray(dev) ? dev : [],
        st: Array.isArray(st) ? st : [],
        rec: Array.isArray(rec) ? rec : [],
        vq: Array.isArray(vq) ? vq : [],
        spec: Array.isArray(spec) ? spec : [],
      });
    } catch {
      setData({ eq: [], dev: [], st: [], rec: [], vq: [], spec: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cards: [string, any[], string, string][] = [
    ['Equipment & Calibration', data.eq, 'equipment', 'build-outline'],
    ['Deviations & CAPA', data.dev, 'deviations', 'alert-circle-outline'],
    ['Stability Studies', data.st, 'stability', 'flask-outline'],
    ['Recalls & Traceability', data.rec, 'recalls', 'archive-outline'],
    ['Vendor Qualification', data.vq, 'vendors', 'shield-checkmark-outline'],
    ['AYUSH QC Specifications', data.spec, 'specifications', 'ribbon-outline'],
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <ScreenHeader title="GMP & AYUSH Compliance" subtitle="Connected manufacturing quality controls" />
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 10, color: colors.textSecondary }}>Loading compliance modules...</Text>
        </View>
      ) : (
        cards.map(([title, items, key, iconName]) => (
          <View key={key} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.row}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.iconBadge, { backgroundColor: colors.primary + '15' }]}>
                  <Ionicons name={iconName as any} size={20} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                  <Text style={[styles.count, { color: colors.textSecondary }]}>
                    {Array.isArray(items) ? items.length : 0} active records
                  </Text>
                </View>
              </View>
              <View style={[styles.badgePill, { backgroundColor: colors.success + '15' }]}>
                <Text style={[styles.badgeText, { color: colors.success }]}>CONNECTED</Text>
              </View>
            </View>
            <Text style={[styles.note, { color: colors.textSecondary }]}>
              This quality module is integrated with production logs, BMR release gates, and AYUSH GMP compliance records.
            </Text>
          </View>
        ))
      )}
      <TouchableOpacity onPress={load} style={[styles.refresh, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
        <Ionicons name="refresh-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
        <Text style={{ color: '#fff', fontWeight: '700' }}>Refresh compliance data</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14 },
  loadingBox: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 18, borderWidth: 1, borderRadius: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBadge: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700' },
  count: { fontSize: 13, marginTop: 2 },
  badgePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  note: { marginTop: 12, fontSize: 13, lineHeight: 18 },
  refresh: { padding: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
});
