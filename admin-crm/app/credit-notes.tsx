import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, RefreshControl, Modal, ActivityIndicator,
  Pressable, Platform, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { api, CreditNote, Customer, Vendor } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';

export default function CreditNotesPage() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showModal, setShowModal] = useState(false);

  const fetchNotes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getCreditNotes(search, filterType);
      setNotes(res || []);
    } catch (err) {
      console.error('Error fetching credit notes:', err);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterType]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleFinalize = async (id: string) => {
    const doFinalize = async () => {
      try {
        await api.finalizeCreditNote(id);
        fetchNotes();
      } catch (err: any) {
        alert(err.message || 'Failed to finalize note');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Finalize this note? This will update the party balance.')) {
        doFinalize();
      }
    } else {
      Alert.alert('Finalize Note', 'Finalize this note? This will update the party balance.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Finalize', onPress: doFinalize }
      ]);
    }
  };

  const handleCancel = async (id: string) => {
    const doCancel = async () => {
      try {
        await api.cancelCreditNote(id);
        fetchNotes();
      } catch (err: any) {
        alert(err.message || 'Failed to cancel note');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Cancel this note? Party balance adjustment will be reverted.')) {
        doCancel();
      }
    } else {
      Alert.alert('Cancel Note', 'Cancel this note? Party balance adjustment will be reverted.', [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Cancel', style: 'destructive', onPress: doCancel }
      ]);
    }
  };

  const totalCreditAmt = notes.filter(n => n.type === 'credit_note').reduce((s, n) => s + (n.totalAmount || 0), 0);
  const totalDebitAmt = notes.filter(n => n.type === 'debit_note').reduce((s, n) => s + (n.totalAmount || 0), 0);

  return (
    <View style={styles.screen}>
      <View style={styles.innerContainer}>
        {/* Standardized Search Bar */}
        <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.xs }}>
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
              style={{ flex: 1, height: 42, color: colors.text.primary, fontSize: 13, minWidth: 100 }}
              placeholder="Search by Note #, Party, Invoice..."
              placeholderTextColor={colors.text.muted}
              value={search}
              onChangeText={setSearch}
            />

            {Platform.OS === 'web' ? (
              <select
                value={filterType}
                onChange={(e: any) => setFilterType(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: `1px solid ${colors.border}`,
                  backgroundColor: colors.bg.secondary,
                  color: colors.text.primary,
                  fontSize: 12,
                  fontWeight: '600',
                  outline: 'none',
                  height: 34,
                  cursor: 'pointer'
                }}
              >
                <option value="all">All Notes</option>
                <option value="credit_note">Credit Notes</option>
                <option value="debit_note">Debit Notes</option>
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
                  height: 34,
                  gap: 6
                }}
                onPress={() => {
                  Alert.alert('Filter Type', '', [
                    { text: 'All Notes', onPress: () => setFilterType('all') },
                    { text: 'Credit Notes', onPress: () => setFilterType('credit_note') },
                    { text: 'Debit Notes', onPress: () => setFilterType('debit_note') }
                  ]);
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.primary }}>
                  {filterType === 'all' ? 'All Notes' : filterType === 'credit_note' ? 'Credit Notes' : 'Debit Notes'}
                </Text>
                <Ionicons name="chevron-down" size={12} color={colors.text.muted} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={{ height: 34, paddingHorizontal: 14, borderRadius: Radius.sm, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              onPress={() => setShowModal(true)}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>New Note</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Summary Stats */}
        <View style={styles.summaryRow}>
          <View style={[styles.statCard, { backgroundColor: colors.success + '10', borderColor: colors.success + '30' }]}>
            <Text style={[styles.statLabel, { color: colors.success }]}>CREDIT NOTES</Text>
            <Text style={[styles.statValue, { color: colors.success }]}>₹{totalCreditAmt.toLocaleString('en-IN')}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.danger + '10', borderColor: colors.danger + '30' }]}>
            <Text style={[styles.statLabel, { color: colors.danger }]}>DEBIT NOTES</Text>
            <Text style={[styles.statValue, { color: colors.danger }]}>₹{totalDebitAmt.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        {/* Notes List */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchNotes} tintColor={colors.primary} />}
        >
          {notes.map(note => {
            const isCredit = note.type === 'credit_note';
            return (
              <View key={note._id} style={[styles.card, { borderLeftColor: isCredit ? colors.success : colors.danger }]}>
                <View style={styles.cardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.cardTitle}>{note.noteNo}</Text>
                    <View style={[styles.badge, { backgroundColor: isCredit ? colors.success + '18' : colors.danger + '18' }]}>
                      <Text style={[styles.badgeText, { color: isCredit ? colors.success : colors.danger }]}>
                        {isCredit ? 'CREDIT NOTE' : 'DEBIT NOTE'}
                      </Text>
                    </View>
                  </View>

                  <View style={[
                    styles.badge,
                    {
                      backgroundColor: note.status === 'finalized' ? colors.successLight : note.status === 'draft' ? colors.warningLight : colors.dangerLight,
                      borderColor: note.status === 'finalized' ? colors.success : note.status === 'draft' ? colors.warning : colors.danger,
                      borderWidth: 1
                    }
                  ]}>
                    <Text style={[
                      styles.badgeText,
                      { color: note.status === 'finalized' ? colors.success : note.status === 'draft' ? colors.warning : colors.danger }
                    ]}>
                      {note.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <Text style={styles.cardSub}>
                  Party: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{note.partyName}</Text> ({note.partyType})
                </Text>

                {!!note.invoiceNo && (
                  <Text style={styles.metaText}>Linked Invoice: {note.invoiceNo}</Text>
                )}

                <Text style={[styles.cardAmount, { color: isCredit ? colors.success : colors.danger }]}>
                  {isCredit ? '- ' : '+ '}₹{(note.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>

                {note.reason ? <Text style={styles.cardReason}>Reason: {note.reason}</Text> : null}

                <View style={styles.cardActions}>
                  {note.status === 'draft' && (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.success }]} onPress={() => handleFinalize(note._id)}>
                      <Ionicons name="checkmark-done" size={14} color="#fff" />
                      <Text style={styles.actionBtnText}>Finalize & Post Balance</Text>
                    </TouchableOpacity>
                  )}
                  {note.status === 'finalized' && (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.danger }]} onPress={() => handleCancel(note._id)}>
                      <Ionicons name="close-circle-outline" size={14} color="#fff" />
                      <Text style={styles.actionBtnText}>Cancel Note</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}

          {!loading && notes.length === 0 && (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={40} color={colors.text.muted} />
              <Text style={styles.emptyText}>No Credit / Debit Notes recorded.</Text>
            </View>
          )}
        </ScrollView>

        {/* Pinned FAB */}
        <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      <CreateCreditNoteModal visible={showModal} onClose={() => { setShowModal(false); fetchNotes(); }} />
    </View>
  );
}

function CreateCreditNoteModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const [type, setType] = useState<'credit_note' | 'debit_note'>('credit_note');
  const [partyType, setPartyType] = useState<'Customer' | 'Vendor'>('Customer');
  const [parties, setParties] = useState<any[]>([]);
  const [partyId, setPartyId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [reason, setReason] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setType('credit_note');
      setPartyType('Customer');
      setPartyId('');
      setPartyName('');
      setInvoiceNo('');
      setReason('');
      setTotalAmount('');
      setError('');
      setShowPartyDropdown(false);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      const loadParties = async () => {
        try {
          if (partyType === 'Customer') {
            const res = await api.getCustomers();
            setParties(res);
          } else {
            const res = await api.getVendors();
            setParties(res);
          }
        } catch (err) {
          console.error(err);
        }
      };
      loadParties();
    }
  }, [visible, partyType]);

  const filteredParties = partyName
    ? parties.filter(p => (p.company || p.name).toLowerCase().includes(partyName.toLowerCase()))
    : parties;

  const handleSelectParty = (p: any) => {
    setPartyId(p._id);
    setPartyName(p.company || p.name);
    setShowPartyDropdown(false);
  };

  const handleSave = async () => {
    if (!partyName.trim() || !totalAmount || isNaN(Number(totalAmount)) || Number(totalAmount) <= 0) {
      setError('Please select a party and enter a valid amount.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      await api.createCreditNote({
        type,
        partyType,
        partyId: partyId || undefined,
        partyName: partyName.trim(),
        invoiceNo: invoiceNo.trim(),
        totalAmount: Number(totalAmount),
        baseAmount: Number(totalAmount),
        reason: reason.trim(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalContent} onPress={() => {}}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Credit / Debit Note</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {error ? <Text style={styles.modalError}>{error}</Text> : null}

            {/* Note Type Selector */}
            <Text style={styles.label}>Note Type *</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: Spacing.md }}>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  type === 'credit_note' && { backgroundColor: colors.success, borderColor: colors.success }
                ]}
                onPress={() => setType('credit_note')}
              >
                <Text style={[styles.toggleText, type === 'credit_note' && { color: '#fff' }]}>Credit Note (Return/Discount)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  type === 'debit_note' && { backgroundColor: colors.danger, borderColor: colors.danger }
                ]}
                onPress={() => setType('debit_note')}
              >
                <Text style={[styles.toggleText, type === 'debit_note' && { color: '#fff' }]}>Debit Note (Price Adjustment)</Text>
              </TouchableOpacity>
            </View>

            {/* Party Type Selector */}
            <Text style={styles.label}>Party Type *</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: Spacing.md }}>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  partyType === 'Customer' && { backgroundColor: colors.primary, borderColor: colors.primary }
                ]}
                onPress={() => { setPartyType('Customer'); setPartyId(''); setPartyName(''); }}
              >
                <Text style={[styles.toggleText, partyType === 'Customer' && { color: '#fff' }]}>Customer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  partyType === 'Vendor' && { backgroundColor: colors.primary, borderColor: colors.primary }
                ]}
                onPress={() => { setPartyType('Vendor'); setPartyId(''); setPartyName(''); }}
              >
                <Text style={[styles.toggleText, partyType === 'Vendor' && { color: '#fff' }]}>Vendor</Text>
              </TouchableOpacity>
            </View>

            {/* Party Selection Autocomplete */}
            <View style={{ zIndex: 2000, position: 'relative', marginBottom: Spacing.md }}>
              <Text style={styles.label}>{partyType} Name *</Text>
              <TextInput
                style={styles.input}
                placeholder={`Search ${partyType.toLowerCase()}...`}
                placeholderTextColor={colors.text.muted}
                value={partyName}
                onChangeText={(txt) => {
                  setPartyName(txt);
                  const exact = parties.find(p => (p.company || p.name).toLowerCase() === txt.trim().toLowerCase());
                  if (exact) setPartyId(exact._id); else setPartyId('');
                  setShowPartyDropdown(true);
                }}
                onFocus={() => setShowPartyDropdown(true)}
              />
              {showPartyDropdown && filteredParties.length > 0 && (
                <View style={styles.dropdownList}>
                  {filteredParties.slice(0, 5).map((p) => (
                    <TouchableOpacity key={p._id} style={styles.dropdownItem} onPress={() => handleSelectParty(p)}>
                      <Text style={styles.dropdownItemText}>{p.company || p.name}</Text>
                      <Text style={styles.dropdownItemSub}>
                        Outstanding Balance: ₹{(p.regularBalance || 0).toLocaleString('en-IN')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Amount */}
            <View style={{ marginBottom: Spacing.md }}>
              <Text style={styles.label}>Amount *</Text>
              <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0 }]}>
                <Text style={{ paddingLeft: 12, paddingRight: 4, color: colors.text.secondary, fontWeight: '700' }}>₹</Text>
                <TextInput
                  style={{ flex: 1, height: '100%', color: colors.text.primary, fontSize: 14 }}
                  placeholder="0.00"
                  placeholderTextColor={colors.text.muted}
                  value={totalAmount}
                  onChangeText={setTotalAmount}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Invoice Reference */}
            <View style={{ marginBottom: Spacing.md }}>
              <Text style={styles.label}>Linked Invoice No. (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. INV-2026-001"
                placeholderTextColor={colors.text.muted}
                value={invoiceNo}
                onChangeText={setInvoiceNo}
              />
            </View>

            {/* Reason */}
            <View style={{ marginBottom: Spacing.md }}>
              <Text style={styles.label}>Reason / Remarks</Text>
              <TextInput
                style={[styles.input, { height: 70, paddingTop: 10 }]}
                placeholder="e.g. Goods return, price correction..."
                placeholderTextColor={colors.text.muted}
                value={reason}
                onChangeText={setReason}
                multiline
                textAlignVertical="top"
              />
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { opacity: (partyName && totalAmount) ? 1 : 0.5 }]}
              onPress={handleSave}
              disabled={!partyName || !totalAmount || saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Note</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  innerContainer: { flex: 1, width: '100%' },
  header: { marginBottom: Spacing.md, gap: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.card, borderRadius: Radius.md, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, height: 44, gap: 8 },
  searchInput: { flex: 1, height: '100%', color: colors.text.primary, fontSize: 14 },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.md },
  statCard: { flex: 1, backgroundColor: colors.bg.card, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1 },
  statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  statValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },

  card: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text.primary },
  cardSub: { fontSize: 13, color: colors.text.secondary, marginBottom: 4 },
  metaText: { fontSize: 11, color: colors.text.muted, marginBottom: 4 },
  cardAmount: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  cardReason: { fontSize: 12, color: colors.text.muted, fontStyle: 'italic', marginBottom: 6 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.sm },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  emptyContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyText: { marginTop: 10, color: colors.text.muted, fontSize: 14 },

  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 6, boxShadow: '0px 4px 10px rgba(0,0,0,0.3)' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', maxWidth: 500, backgroundColor: colors.bg.card, borderRadius: Radius.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text.primary },
  closeBtn: { padding: 4 },
  modalBody: { padding: Spacing.lg },
  modalError: { padding: 10, backgroundColor: colors.danger + '15', borderRadius: Radius.sm, color: colors.danger, fontSize: 12, fontWeight: '600', marginBottom: Spacing.md },
  label: { fontSize: 11, fontWeight: '700', color: colors.text.secondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, backgroundColor: colors.bg.primary, color: colors.text.primary, fontSize: 14 },
  
  toggleBtn: { flex: 1, height: 40, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.primary, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  toggleText: { fontSize: 12, fontWeight: '600', color: colors.text.secondary, textAlign: 'center' },
  
  dropdownList: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, marginTop: 4, maxHeight: 150, zIndex: 9999, elevation: 5, boxShadow: '0px 2px 4px rgba(0,0,0,0.1)' },
  dropdownItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  dropdownItemText: { fontSize: 13, fontWeight: '600', color: colors.text.primary },
  dropdownItemSub: { fontSize: 11, color: colors.text.muted, marginTop: 2 },

  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', padding: Spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: Radius.md, backgroundColor: colors.bg.secondary },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: Radius.md, backgroundColor: colors.primary },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' }
});
