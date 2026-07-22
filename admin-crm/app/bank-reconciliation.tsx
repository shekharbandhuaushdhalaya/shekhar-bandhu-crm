import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, RefreshControl, Modal, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { api } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';

function BankReconciliationPage() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchEntryId, setMatchEntryId] = useState<string | null>(null);
  const [matchPaymentId, setMatchPaymentId] = useState('');
  const [matchInvoiceId, setMatchInvoiceId] = useState('');

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await api.get(`/api/bank-reconciliation?${params}`);
      setEntries(res.data);
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  };

  useEffect(() => { fetchEntries() }, [statusFilter]);

  const openMatchModal = (id: string) => {
    setMatchEntryId(id);
    setMatchPaymentId('');
    setMatchInvoiceId('');
    setShowMatchModal(true);
  };

  const handleMatch = async () => {
    if (!matchEntryId) return;
    try {
      await api.post(`/api/bank-reconciliation/${matchEntryId}/match`, { paymentId: matchPaymentId || undefined, invoiceId: matchInvoiceId || undefined });
      setShowMatchModal(false);
      setMatchEntryId(null);
      fetchEntries();
    } catch (err: any) { alert(err.response?.data?.error || err.message) }
  };

  const handleUnmatch = async (id: string) => {
    try {
      await api.post(`/api/bank-reconciliation/${id}/unmatch`);
      fetchEntries();
    } catch (err: any) { alert(err.response?.data?.error || err.message) }
  };

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchEntries} />}>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: Spacing.md, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: 'All' },
          { key: 'unmatched', label: 'Unmatched' },
          { key: 'matched', label: 'Matched' },
          { key: 'flagged', label: 'Flagged' },
        ].map(s => (
          <TouchableOpacity key={s.key} style={[styles.chip, statusFilter === s.key && styles.chipActive]} onPress={() => setStatusFilter(s.key)}>
            <Text style={[styles.chipText, statusFilter === s.key && { color: '#fff' }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {entries.map(entry => (
        <View key={entry._id} style={[styles.card, { borderLeftWidth: 3, borderLeftColor: entry.status === 'matched' ? colors.success : entry.status === 'flagged' ? colors.warning : colors.text.muted }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: colors.text.primary, fontWeight: '600' }}>{new Date(entry.transactionDate).toLocaleDateString()}</Text>
            <View style={[styles.badge, { backgroundColor: entry.status === 'matched' ? colors.successLight : entry.status === 'flagged' ? colors.warningLight : colors.infoLight }]}>
              <Text style={[styles.badgeText, { color: entry.status === 'matched' ? colors.success : entry.status === 'flagged' ? colors.warning : colors.info }]}>{entry.status}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 4 }}>{entry.description}</Text>
          {entry.reference ? <Text style={{ fontSize: 12, color: colors.text.muted }}>Ref: {entry.reference}</Text> : null}
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text.primary, marginTop: 4 }}>
            {entry.credit > 0 ? `+₹${entry.credit.toLocaleString()}` : entry.debit > 0 ? `-₹${entry.debit.toLocaleString()}` : ''}
          </Text>
          {entry.matchedPaymentId && <Text style={{ fontSize: 11, color: colors.success }}>Matched to Payment: {entry.matchedPaymentId}</Text>}
          {entry.matchedInvoiceId && <Text style={{ fontSize: 11, color: colors.success }}>Matched to Invoice: {entry.matchedInvoiceId}</Text>}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {entry.status === 'unmatched' && (
              <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: colors.primary }} onPress={() => openMatchModal(entry._id)}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Match</Text>
              </TouchableOpacity>
            )}
            {entry.status === 'matched' && (
              <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: colors.warning }} onPress={() => handleUnmatch(entry._id)}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Unmatch</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
      {!loading && entries.length === 0 && <Text style={{ textAlign: 'center', color: colors.text.muted, marginTop: 40 }}>No bank statement entries</Text>}

      <TouchableOpacity style={styles.fab} onPress={() => setShowImportModal(true)}>
        <Ionicons name="add" size={24} color="#fff" />
      </TouchableOpacity>

      <ImportBankModal visible={showImportModal} onClose={() => { setShowImportModal(false); fetchEntries() }} />

      <Modal visible={showMatchModal} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowMatchModal(false)} />
          <View style={{ backgroundColor: colors.bg.card, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, padding: Spacing.lg }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text.primary, marginBottom: Spacing.md }}>Match Bank Entry</Text>
            <Text style={{ fontSize: 12, color: colors.text.muted, marginBottom: Spacing.sm }}>Optionally link this entry to a payment or invoice.</Text>
            <TextInput style={{ backgroundColor: colors.bg.primary, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: colors.text.primary, borderWidth: 1, borderColor: colors.border, marginBottom: Spacing.sm }} placeholder="Payment ID (optional)" placeholderTextColor={colors.text.muted} value={matchPaymentId} onChangeText={setMatchPaymentId} />
            <TextInput style={{ backgroundColor: colors.bg.primary, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: colors.text.primary, borderWidth: 1, borderColor: colors.border, marginBottom: Spacing.lg }} placeholder="Invoice ID (optional)" placeholderTextColor={colors.text.muted} value={matchInvoiceId} onChangeText={setMatchInvoiceId} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={{ flex: 1, padding: 14, borderRadius: Radius.sm, backgroundColor: colors.bg.secondary, alignItems: 'center' }} onPress={() => setShowMatchModal(false)}>
                <Text style={{ color: colors.text.secondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, padding: 14, borderRadius: Radius.sm, backgroundColor: colors.primary, alignItems: 'center' }} onPress={handleMatch}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Match</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function ImportBankModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const [csvText, setCsvText] = useState('');
  const [saving, setSaving] = useState(false);

  const handleImport = async () => {
    if (!csvText.trim()) { alert('Paste bank statement text'); return }
    try {
      setSaving(true);
      const lines = csvText.trim().split('\n').filter(Boolean);
      const entries = lines.map(line => {
        const parts = line.split(',');
        return {
          transactionDate: parts[0]?.trim() || new Date().toISOString(),
          description: parts[1]?.trim() || '',
          reference: parts[2]?.trim() || '',
          debit: parseFloat(parts[3]) || 0,
          credit: parseFloat(parts[4]) || 0,
          balance: parseFloat(parts[5]) || 0,
        };
      });
      await api.post('/api/bank-reconciliation/import', { entries });
      onClose();
    } catch (err: any) { alert(err.response?.data?.error || err.message) }
    finally { setSaving(false) }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: colors.bg.card, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, padding: Spacing.lg }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text.primary, marginBottom: Spacing.md }}>Import Bank Statement</Text>
          <Text style={{ fontSize: 12, color: colors.text.muted, marginBottom: Spacing.sm }}>Paste CSV: date, description, reference, debit, credit, balance (one per line)</Text>
          <TextInput style={{ backgroundColor: colors.bg.primary, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: colors.text.primary, borderWidth: 1, borderColor: colors.border, marginBottom: Spacing.lg, minHeight: 150, textAlignVertical: 'top' }} placeholder={"2024-01-15,Payment from Customer,INV001,0,50000,50000\n2024-01-16,Rent paid,,15000,0,35000"} placeholderTextColor={colors.text.muted} value={csvText} onChangeText={setCsvText} multiline />
          <TouchableOpacity style={{ padding: 14, borderRadius: Radius.sm, backgroundColor: colors.primary, alignItems: 'center' }} onPress={handleImport} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Import</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary, padding: Spacing.md },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  card: { backgroundColor: colors.bg.card, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: colors.border },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 6 },
});

export default BankReconciliationPage;
