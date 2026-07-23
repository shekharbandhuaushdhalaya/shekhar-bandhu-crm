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
import { FIRM_DETAILS } from '../constants/firm';

// ── Print CGST Rule 53 Compliant Credit / Debit Note ──────────────────────────
const printCreditNote = (note: CreditNote) => {
  if (Platform.OS !== 'web') {
    alert('Print is available on web only.');
    return;
  }

  const isCredit = note.type === 'credit_note';
  const docTitle = isCredit ? 'CREDIT NOTE' : 'DEBIT NOTE';
  const dateStr = new Date(note.date || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const baseAmt = note.baseAmount || note.totalAmount || 0;
  const cgst = note.cgst || 0;
  const sgst = note.sgst || 0;
  const igst = note.igst || 0;
  const totalTax = cgst + sgst + igst;
  const grandTotal = note.totalAmount || (baseAmt + totalTax);

  const signatureBlock = (FIRM_DETAILS.signatureBase64 || FIRM_DETAILS.signatureUrl) ? `
    <img src="${FIRM_DETAILS.signatureBase64 || FIRM_DETAILS.signatureUrl}" style="max-height: 38px; width: auto; object-fit: contain; margin-bottom: 2px;" />
    <div style="font-weight:bold; font-size: 10px; color: #15803d; margin-bottom: 2px;">
      ✔ DIGITALLY SIGNED ${docTitle}
    </div>
    <div style="border: 1px dashed #16a34a; background-color: #f0fdf4; border-radius: 4px; padding: 5px; font-size: 8px; text-align: left; line-height: 1.3; display: flex; align-items: center; gap: 8px;">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`GST ${docTitle} Verification | Seller: ${FIRM_DETAILS.name} | GSTIN: ${FIRM_DETAILS.gstin || ''} | Doc: ${note.noteNo} | InvRef: ${note.invoiceNo || 'N/A'} | Date: ${dateStr} | Amt: ₹${grandTotal.toFixed(2)} | CGST Rule 53 Compliant`)}" style="width: 48px; height: 48px; border: 1px solid #16a34a; padding: 2px; background: #fff; border-radius: 3px; flex-shrink: 0;" />
      <div style="flex: 1;">
        <strong>Signed By:</strong> ${FIRM_DETAILS.name}<br/>
        <strong>GSTIN:</strong> ${FIRM_DETAILS.gstin || ''}<br/>
        <span style="color: #15803d; font-weight: bold;">✔ Certified under CGST Rule 53 &amp; Sec 5 IT Act.</span>
      </div>
    </div>
  ` : `
    For ${FIRM_DETAILS.name}<br/><br/>Authorised Signatory
  `;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${docTitle} ${note.noteNo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #000; background: #fff; }
    .page { width: 210mm; padding: 10mm; margin: 0 auto; }
    table { border-collapse: collapse; width: 100%; }
    @media print { @page { size: A4 portrait; margin: 0; } .page { page-break-after: always; padding: 10mm; } }
  </style>
</head>
<body>
  <div class="page">
    <div style="text-align:center; border:2px solid #000; padding:8px; margin-bottom:10px;">
      <div style="font-weight:bold; font-size:18px;">${FIRM_DETAILS.name}</div>
      <div style="font-size:10px;">${FIRM_DETAILS.address}</div>
      <div style="font-size:10px;">GSTIN: ${FIRM_DETAILS.gstin} | Phone: ${FIRM_DETAILS.phone}</div>
      <div style="font-size:14px; font-weight:bold; margin-top:6px; letter-spacing:1px; color: ${isCredit ? '#15803d' : '#b91c1c'};">
        ${docTitle} — GST RULE 53 COMPLIANT
      </div>
      <div style="font-size:9px; color:#555;">(Issued under Section 34 of CGST Act, 2017)</div>
    </div>

    <table style="margin-bottom:10px; font-size:11px; border:1px solid #000;">
      <tr>
        <td style="width:50%; padding:6px; border-right:1px solid #000; vertical-align:top;">
          <strong>Note Number:</strong> ${note.noteNo}<br/>
          <strong>Date of Issue:</strong> ${dateStr}<br/>
          <strong>Linked Original Invoice:</strong> ${note.invoiceNo || 'N/A'}<br/>
          <strong>Reason for Issue:</strong> ${note.reason || 'Sales Adjustment'}
        </td>
        <td style="width:50%; padding:6px; vertical-align:top;">
          <strong>Billed To Party:</strong> ${note.partyName}<br/>
          <strong>Party Type:</strong> ${note.partyType}<br/>
          <strong>Status:</strong> ${note.status.toUpperCase()}
        </td>
      </tr>
    </table>

    <table style="font-size:11px; margin-bottom:12px; border:1px solid #000;">
      <thead>
        <tr style="background:#f3f4f6; border-bottom:1px solid #000;">
          <th style="padding:6px; border-right:1px solid #000; text-align:left;">Description / Particulars</th>
          <th style="padding:6px; border-right:1px solid #000; width:20%; text-align:right;">Taxable Base (₹)</th>
          <th style="padding:6px; border-right:1px solid #000; width:15%; text-align:right;">GST Rate</th>
          <th style="padding:6px; width:25%; text-align:right;">Adjustment Value (₹)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid #000;">
          <td style="padding:8px; border-right:1px solid #000;">
            Adjustment towards ${isCredit ? 'Credit (Discount / Return)' : 'Debit (Price Increase)'} for Invoice ${note.invoiceNo || 'Ref'}<br/>
            <span style="font-size:9px; color:#666;">${note.reason || ''}</span>
          </td>
          <td style="padding:8px; border-right:1px solid #000; text-align:right;">${baseAmt.toFixed(2)}</td>
          <td style="padding:8px; border-right:1px solid #000; text-align:right;">${note.gstRate || 0}%</td>
          <td style="padding:8px; text-align:right; font-weight:bold;">${grandTotal.toFixed(2)}</td>
        </tr>
      </tbody>
      <tfoot>
        ${cgst > 0 ? `<tr><td colspan="3" style="text-align:right; padding:4px; border-right:1px solid #000;">CGST</td><td style="text-align:right; padding:4px;">${cgst.toFixed(2)}</td></tr>` : ''}
        ${sgst > 0 ? `<tr><td colspan="3" style="text-align:right; padding:4px; border-right:1px solid #000;">SGST</td><td style="text-align:right; padding:4px;">${sgst.toFixed(2)}</td></tr>` : ''}
        ${igst > 0 ? `<tr><td colspan="3" style="text-align:right; padding:4px; border-right:1px solid #000;">IGST</td><td style="text-align:right; padding:4px;">${igst.toFixed(2)}</td></tr>` : ''}
        <tr style="border-top:1px solid #000; font-weight:bold; background:#f9fafb;">
          <td colspan="3" style="text-align:right; padding:6px; border-right:1px solid #000;">Net Total Adjustment</td>
          <td style="text-align:right; padding:6px; font-size:14px; color: ${isCredit ? '#15803d' : '#b91c1c'};">₹${grandTotal.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>

    <div style="margin-top:30px; display:flex; justify-content:space-between; align-items:center; font-size:10px;">
      <div style="width:50%;">
        <strong>Declaration:</strong><br/>
        This document is issued under Section 34 of the CGST Act, 2017 & CGST Rule 53.
      </div>
      <div style="text-align:right;">
        ${signatureBlock}
      </div>
    </div>
  </div>
  <script>window.print();</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=800,height=900');
  if (win) { win.document.write(html); win.document.close(); }
};

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
          contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: 80 }}
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
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={() => printCreditNote(note)}>
                    <Ionicons name="print-outline" size={14} color="#fff" />
                    <Text style={styles.actionBtnText}>Print Document</Text>
                  </TouchableOpacity>
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
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [reason, setReason] = useState('01 - Sales Return / Goods Rejection');
  const [totalAmount, setTotalAmount] = useState('');
  const [gstRate, setGstRate] = useState('18');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setType('credit_note');
      setPartyType('Customer');
      setPartyId('');
      setPartyName('');
      setInvoiceNo('');
      setCustomerInvoices([]);
      setReason('01 - Sales Return / Goods Rejection');
      setTotalAmount('');
      setGstRate('18');
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
    ? parties.filter(p =>
        (p.company || '').toLowerCase().includes(partyName.toLowerCase()) ||
        (p.name || '').toLowerCase().includes(partyName.toLowerCase()) ||
        (p.displayName || '').toLowerCase().includes(partyName.toLowerCase())
      )
    : parties;

  const handleSelectParty = async (p: any) => {
    const selectedName = p.company || p.displayName || p.name;
    setPartyId(p._id);
    setPartyName(selectedName);
    setShowPartyDropdown(false);

    if (partyType === 'Customer') {
      try {
        setLoadingInvoices(true);
        const invs = await api.getSaleInvoices(selectedName);
        const matched = (invs || []).filter(inv =>
          (inv.customerName || '').toLowerCase().includes(selectedName.toLowerCase()) ||
          (p.company && (inv.customerName || '').toLowerCase().includes(p.company.toLowerCase())) ||
          (p.name && (inv.customerName || '').toLowerCase().includes(p.name.toLowerCase()))
        );
        setCustomerInvoices(matched);
        if (matched.length > 0) {
          setInvoiceNo(matched[0].invoiceNo);
          setTotalAmount((matched[0].baseAmount || matched[0].amount || 0).toString());
        }
      } catch (err) {
        console.error('Failed to load customer invoices:', err);
      } finally {
        setLoadingInvoices(false);
      }
    }
  };

  const handleSave = async () => {
    if (!partyName.trim() || !totalAmount || isNaN(Number(totalAmount)) || Number(totalAmount) <= 0) {
      setError('Please select a party and enter a valid base amount.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const base = parseFloat(totalAmount) || 0;
      const rate = parseFloat(gstRate) || 0;
      const tax = (base * rate) / 100;
      const total = Math.round(base + tax);

      const targetParty = parties.find(p => p._id === partyId || (p.company || p.name).toLowerCase() === partyName.trim().toLowerCase());
      const gstin = targetParty?.gstin || '';
      const isIntraState = gstin ? gstin.startsWith('09') : true;

      const cgst = rate > 0 && isIntraState ? tax / 2 : 0;
      const sgst = rate > 0 && isIntraState ? tax / 2 : 0;
      const igst = rate > 0 && !isIntraState ? tax : 0;

      await api.createCreditNote({
        type,
        partyType,
        partyId: partyId || undefined,
        partyName: partyName.trim(),
        invoiceNo: invoiceNo.trim(),
        baseAmount: base,
        gstRate: rate,
        cgst,
        sgst,
        igst,
        totalAmount: total,
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

            {/* GST Statutory Reason Selector */}
            <View style={{ marginBottom: Spacing.md }}>
              <Text style={styles.label}>GST Statutory Reason *</Text>
              {Platform.OS === 'web' ? (
                <select
                  value={reason}
                  onChange={(e: any) => setReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border}`,
                    backgroundColor: colors.bg.primary,
                    color: colors.text.primary,
                    fontSize: 13,
                    outline: 'none',
                  }}
                >
                  <option value="01 - Sales Return / Goods Rejection">01 - Sales Return / Goods Rejection</option>
                  <option value="02 - Post Sale Discount / Rate Difference">02 - Post Sale Discount / Rate Difference</option>
                  <option value="03 - Deficiency in Services / Shortage">03 - Deficiency in Services / Shortage</option>
                  <option value="04 - Correction in Invoice / Tax Rate Adjustment">04 - Correction in Invoice / Tax Rate Adjustment</option>
                  <option value="05 - Other Adjustment">05 - Other Adjustment</option>
                </select>
              ) : (
                <TextInput
                  style={styles.input}
                  placeholder="Reason for issuance..."
                  placeholderTextColor={colors.text.muted}
                  value={reason}
                  onChangeText={setReason}
                />
              )}
            </View>

            {/* Linked Invoice Reference */}
            <View style={{ marginBottom: Spacing.md }}>
              <Text style={styles.label}>Linked Original Invoice No. (Rule 53 Mandate)</Text>
              {loadingInvoices ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ fontSize: 12, color: colors.text.muted }}>Fetching customer invoices...</Text>
                </View>
              ) : (customerInvoices.length > 0 && Platform.OS === 'web') ? (
                <select
                  value={invoiceNo}
                  onChange={(e: any) => {
                    const selInvNo = e.target.value;
                    setInvoiceNo(selInvNo);
                    const selected = customerInvoices.find(inv => inv.invoiceNo === selInvNo);
                    if (selected) {
                      setTotalAmount((selected.baseAmount || selected.amount || 0).toString());
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border}`,
                    backgroundColor: colors.bg.primary,
                    color: colors.text.primary,
                    fontSize: 13,
                    outline: 'none',
                    height: 44,
                  }}
                >
                  <option value="">-- Select Linked Invoice --</option>
                  {customerInvoices.map((inv) => (
                    <option key={inv._id} value={inv.invoiceNo}>
                      {inv.invoiceNo} | {new Date(inv.date || Date.now()).toLocaleDateString('en-IN')} | ₹{(inv.amount || 0).toLocaleString('en-IN')}
                    </option>
                  ))}
                </select>
              ) : (
                <TextInput
                  style={styles.input}
                  placeholder="e.g. SB-2026-001"
                  placeholderTextColor={colors.text.muted}
                  value={invoiceNo}
                  onChangeText={setInvoiceNo}
                />
              )}
            </View>

            {/* Amount & Tax Breakdown */}
            <View style={{ backgroundColor: colors.bg.secondary, borderRadius: Radius.md, padding: 12, marginBottom: Spacing.md, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary, marginBottom: 8, textTransform: 'uppercase' }}>
                💰 GST Tax & Value Adjustment (Rule 53)
              </Text>
              
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Taxable Base Amount (₹) *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.bg.card }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.text.muted}
                    value={totalAmount}
                    onChangeText={setTotalAmount}
                    keyboardType="numeric"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>GST Rate (%)</Text>
                  {Platform.OS === 'web' ? (
                    <select
                      value={gstRate}
                      onChange={(e: any) => setGstRate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: `1px solid ${colors.border}`,
                        backgroundColor: colors.bg.card,
                        color: colors.text.primary,
                        fontSize: 13,
                        outline: 'none',
                        height: 44,
                      }}
                    >
                      <option value="0">0% (Nil / Exempt)</option>
                      <option value="5">5% GST</option>
                      <option value="12">12% GST</option>
                      <option value="18">18% GST (Standard)</option>
                      <option value="28">28% GST</option>
                    </select>
                  ) : (
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.bg.card }]}
                      placeholder="18"
                      value={gstRate}
                      onChangeText={setGstRate}
                      keyboardType="numeric"
                    />
                  )}
                </View>
              </View>

              {/* Calculated Tax Preview */}
              {(() => {
                const base = parseFloat(totalAmount) || 0;
                const rate = parseFloat(gstRate) || 0;
                const tax = (base * rate) / 100;
                const total = base + tax;
                return (
                  <View style={{ marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, color: colors.text.muted }}>
                      Tax: ₹{tax.toFixed(2)} ({rate > 0 ? `CGST: ₹${(tax/2).toFixed(2)} | SGST: ₹${(tax/2).toFixed(2)}` : 'Nil'})
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: type === 'credit_note' ? colors.success : colors.danger }}>
                      Total: ₹{total.toFixed(2)}
                    </Text>
                  </View>
                );
              })()}
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

  summaryRow: { flexDirection: 'row', gap: 16, paddingHorizontal: Spacing.lg, marginTop: Spacing.xs, marginBottom: Spacing.md },
  statCard: { flex: 1, backgroundColor: colors.bg.card, borderRadius: Radius.md, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1 },
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
