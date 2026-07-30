import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, RefreshControl, Modal, KeyboardAvoidingView, Platform, Pressable, Alert, useWindowDimensions, DeviceEventEmitter } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { api, Payment, Customer, Vendor } from '../utils/api';
import { shortenPartyName } from '../utils/string';
import { useAuth } from '../utils/auth';
import { useTheme, useStyles } from '../utils/themeContext';

export const GATEWAY_CLEARING_ACCOUNTS = [
  { _id: 'clearing_razorpay', name: 'Razorpay Online Gateway Clearing Account', code: 'RAZORPAY', type: 'online_gateway' },
  { _id: 'clearing_cod_courier', name: 'Courier COD Clearing Account (Delhivery/Shiprocket)', code: 'COD_COURIER', type: 'cod_courier' },
  { _id: 'clearing_cash_box', name: 'Store Counter Cash Box Clearing Account', code: 'CASH_BOX', type: 'counter_cash' },
];

export function AddPaymentModal({ visible, onClose, onSaved, initialType, fixedPartyId, fixedPartyName }: { visible: boolean, onClose: () => void, onSaved: () => void, initialType: 'receive' | 'make', fixedPartyId?: string, fixedPartyName?: string }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useStyles(createStyles);
  const canAccessCash = user?.canAccessCash ?? false;

  const getLocalDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [type, setType] = useState<'receive' | 'make'>(initialType);
  const [partyType, setPartyType] = useState<'Customer' | 'Vendor' | 'Gateway Clearing'>(initialType === 'receive' ? 'Customer' : 'Vendor');
  const [parties, setParties] = useState<any[]>([]);
  const [partyId, setPartyId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const partyInputRef = useRef<any>(null);
  const [dropdownLayout, setDropdownLayout] = useState<{ x: number; y: number; width: number } | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getLocalDateString());
  const [mode, setMode] = useState<'regular' | 'cash'>('regular');
  const [method, setMethod] = useState<'Cash' | 'Bank Transfer' | 'Cheque' | 'UPI'>('Cash');
  const [showMethodDropdown, setShowMethodDropdown] = useState(false);
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');

  const methods = ['Cash', 'Bank Transfer', 'Cheque', 'UPI'];

  useEffect(() => {
    if (visible) {
      setType(initialType);
      setPartyType(initialType === 'receive' ? 'Customer' : 'Vendor');
      setPartyId(fixedPartyId || '');
      setPartyName(fixedPartyName || '');
      setShowPartyDropdown(false);
      setAmount('');
      setDate(getLocalDateString());
      setMode('regular');
      setMethod('Cash');
      setReferenceNo('');
      setNotes('');
    }
  }, [visible, initialType]);

  useEffect(() => {
    if (visible) {
      const loadParties = async () => {
        try {
          let res: any[] = [];
          if (partyType === 'Customer') {
            res = await api.getCustomers();
          } else if (partyType === 'Vendor') {
            res = await api.getVendors();
          } else {
            res = GATEWAY_CLEARING_ACCOUNTS;
          }
          setParties(res);

          // Auto-populate partyName if fixedPartyId was passed without name
          if (fixedPartyId && !partyName) {
            const found = res.find((p: any) => p._id === fixedPartyId);
            if (found) setPartyName(found.company || found.name);
          }
        } catch (err) {
          console.error(err);
        }
      };
      loadParties();
    }
  }, [visible, partyType, fixedPartyId]);

  const filteredParties = partyName
    ? parties.filter(p => (p.company || p.name).toLowerCase().includes(partyName.toLowerCase()))
    : parties;

  const handleSelectParty = (p: any) => {
    setPartyId(p._id);
    setPartyName(p.company || p.name);
    setShowPartyDropdown(false);
    setDropdownLayout(null);
  };

  const measureInput = useCallback(() => {
    if (partyInputRef.current && !fixedPartyId) {
      partyInputRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
        setDropdownLayout({ x, y: y + height + 4, width });
      });
    }
  }, [fixedPartyId]);

  const handleSave = async () => {
    if (!partyId || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      alert('Please select a party and enter a valid amount.');
      return;
    }

    const parsedDate = date ? new Date(date) : new Date();
    if (isNaN(parsedDate.getTime())) {
      alert('Please enter a valid date (YYYY-MM-DD).');
      return;
    }

    try {
      await api.createPayment({
        type,
        partyType: partyType as any,
        partyId,
        partyName,
        amount: Number(amount),
        mode,
        paymentMethod: method,
        referenceNo: referenceNo.trim(),
        notes: notes.trim(),
        date: parsedDate.toISOString(),
      });
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={[styles.modalContent, Platform.OS === 'web' ? { overflow: 'visible' } as any : {}]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{type === 'receive' ? 'Receive Payment' : 'Make Payment'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {/* Party Selection — outside ScrollView so dropdown can render below without being clipped by ScrollView */}
          <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm, zIndex: 100 } as any}>
            <Text style={styles.label}>{partyType} *</Text>
            {/* Inner wrapper is the positioning anchor — dropdown left:0/right:0 matches input width */}
            <View style={{ position: 'relative' }}>
              <TextInput
                style={[styles.input, fixedPartyId && { backgroundColor: colors.bg.secondary, color: colors.text.muted }]}
                placeholder={`Search ${type === 'receive' ? 'customer' : 'vendor'}...`}
                placeholderTextColor={colors.text.muted}
                value={partyName}
                onChangeText={(txt) => {
                  setPartyName(txt);
                  const exact = parties.find(p => (p.company || p.name).toLowerCase() === txt.trim().toLowerCase());
                  if (exact) { setPartyId(exact._id); } else { setPartyId(''); }
                  setShowPartyDropdown(true);
                }}
                onFocus={() => { if (!fixedPartyId) setShowPartyDropdown(true); }}
                editable={!fixedPartyId}
              />
              {showPartyDropdown && filteredParties.length > 0 && (
                <View style={[styles.dropdownList, { maxHeight: 220 }]}>
                  <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                    {filteredParties.slice(0, 8).map((p) => (
                      <TouchableOpacity
                        key={p._id}
                        style={styles.dropdownItem}
                        onPress={() => handleSelectParty(p)}
                      >
                        <Text style={styles.dropdownItemText}>{p.company || p.name}</Text>
                        <Text style={styles.dropdownItemSub}>
                          GST Bal: ₹{(p.regularBalance || 0).toLocaleString('en-IN')}
                          {canAccessCash && ` | Cash Bal: ₹${(p.cashBalance || 0).toLocaleString('en-IN')}`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>


          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Selected Party Balance Preview & Quick Fill */}
            {partyId && (
              <View style={{ backgroundColor: colors.bg.secondary, borderRadius: 8, padding: 10, marginBottom: Spacing.md, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontSize: 10, color: colors.text.muted, fontWeight: '700' }}>CURRENT DUE BALANCE</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary, marginTop: 2 }}>
                    GST: ₹{((parties.find(p => p._id === partyId)?.regularBalance) || 0).toLocaleString('en-IN')}
                    {canAccessCash && ` | Cash: ₹${((parties.find(p => p._id === partyId)?.cashBalance) || 0).toLocaleString('en-IN')}`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={{ backgroundColor: colors.primary + '15', borderColor: colors.primary + '40', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}
                  onPress={() => {
                    const selParty = parties.find(p => p._id === partyId);
                    if (selParty) {
                      const bal = mode === 'cash' ? (selParty.cashBalance || 0) : (selParty.regularBalance || 0);
                      if (bal > 0) setAmount(bal.toString());
                    }
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Fill Due</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Amount */}
            <View style={{ marginBottom: Spacing.md }}>
              <Text style={styles.label}>Amount *</Text>
              <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0 }]}>
                <Text style={{ paddingLeft: 12, paddingRight: 4, color: colors.text.secondary, fontWeight: '700' }}>₹</Text>
                <TextInput
                  style={{ flex: 1, height: '100%', color: colors.text.primary, fontSize: 14 }}
                  placeholder="0.00"
                  placeholderTextColor={colors.text.muted}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Date */}
            <View style={{ marginBottom: Spacing.md }}>
              <Text style={styles.label}>Date *</Text>
              <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }]}>
                <Ionicons name="calendar-outline" size={16} color={colors.text.muted} />
                {Platform.OS === 'web' ? React.createElement('input', {
                  type: 'date',
                  value: date,
                  onChange: (e: any) => setDate(e.target.value),
                  style: { flex: 1, height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', color: colors.text.primary, fontSize: 14 }
                }) : (
                  <TextInput
                    style={{ flex: 1, height: '100%', color: colors.text.primary, fontSize: 14 }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.text.muted}
                    value={date}
                    onChangeText={setDate}
                  />
                )}
              </View>
            </View>

            {/* Mode & Method row */}
            {canAccessCash && (
              <View style={[styles.row, { zIndex: 1000, position: 'relative' }]}>
                <View style={{ flex: 1, zIndex: 1000 }}>
                  <Text style={styles.label}>Mode</Text>
                  <View style={styles.toggleGroup}>
                    <TouchableOpacity
                      style={[styles.toggleBtn, mode === 'regular' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => setMode('regular')}
                    >
                      <Text style={[styles.toggleText, mode === 'regular' && { color: '#fff' }]}>GST (Regular)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.toggleBtn, mode === 'cash' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => setMode('cash')}
                    >
                      <Text style={[styles.toggleText, mode === 'cash' && { color: '#fff' }]}>Cash</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
              
              <View style={{ marginBottom: Spacing.md }}>
                <Text style={styles.label}>Payment Method</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                  {methods.map(m => (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.toggleBtn, 
                        { marginRight: 8, paddingHorizontal: 16, borderRadius: 9999 },
                        method === m && { backgroundColor: colors.primary, borderColor: colors.primary }
                      ]}
                      onPress={() => setMethod(m as any)}
                    >
                      <Text style={[styles.toggleText, method === m && { color: '#fff' }]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

            {/* Reference */}
            <View style={{ marginBottom: Spacing.md, zIndex: 500, position: 'relative' }}>
              <Text style={styles.label}>Reference No. (Cheque / UTR)</Text>
              <TextInput
                style={styles.input}
                placeholder="Optional"
                placeholderTextColor={colors.text.muted}
                value={referenceNo}
                onChangeText={setReferenceNo}
              />
            </View>

            {/* Notes */}
            <View style={{ marginBottom: Spacing.md, zIndex: 100, position: 'relative' }}>
              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, { height: 80, paddingTop: 10 }]}
                placeholder="Remarks..."
                placeholderTextColor={colors.text.muted}
                value={notes}
                onChangeText={setNotes}
                multiline
                textAlignVertical="top"
              />
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, { opacity: (partyId && amount) ? 1 : 0.5 }]} onPress={handleSave} disabled={!partyId || !amount}>
              <Text style={styles.saveBtnText}>Save Payment</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function PaymentDetailModal({ visible, payment, onClose }: { visible: boolean, payment: Payment | null, onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  if (!payment) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { maxWidth: 400 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Payment Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalBody}>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 12, color: colors.text.muted, marginBottom: 4, textTransform: 'uppercase', fontWeight: '700' }}>Party</Text>
              <Text style={{ fontSize: 16, color: colors.text.primary, fontWeight: '700' }}>{payment.partyName} <Text style={{ fontSize: 12, fontWeight: '400', color: colors.text.muted }}>({payment.partyType})</Text></Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 12, color: colors.text.muted, marginBottom: 4, textTransform: 'uppercase', fontWeight: '700' }}>Date</Text>
                <Text style={{ fontSize: 14, color: colors.text.primary }}>{new Date(payment.date).toLocaleDateString('en-IN')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, color: colors.text.muted, marginBottom: 4, textTransform: 'uppercase', fontWeight: '700' }}>Amount</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: payment.type === 'receive' ? colors.success : colors.danger }}>
                  {payment.type === 'receive' ? '+ ' : '- '}₹{payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 12, color: colors.text.muted, marginBottom: 4, textTransform: 'uppercase', fontWeight: '700' }}>Mode & Method</Text>
                <Text style={{ fontSize: 14, color: colors.text.primary }}>{payment.mode === 'regular' ? 'GST (Regular)' : 'Cash'} - {payment.paymentMethod}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, color: colors.text.muted, marginBottom: 4, textTransform: 'uppercase', fontWeight: '700' }}>Reference No</Text>
                <Text style={{ fontSize: 14, color: colors.text.primary }}>{payment.referenceNo || 'N/A'}</Text>
              </View>
            </View>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 12, color: colors.text.muted, marginBottom: 4, textTransform: 'uppercase', fontWeight: '700' }}>Notes</Text>
              <Text style={{ fontSize: 14, color: colors.text.primary }}>{payment.notes || 'None'}</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function SettleGatewayModal({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const [selectedGateway, setSelectedGateway] = useState('clearing_razorpay');
  const [grossAmount, setGrossAmount] = useState('');
  const [feeAmount, setFeeAmount] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const gatewayAccount = GATEWAY_CLEARING_ACCOUNTS.find(g => g._id === selectedGateway) || GATEWAY_CLEARING_ACCOUNTS[0];
  const netDeposited = Math.max(0, (Number(grossAmount) || 0) - (Number(feeAmount) || 0));

  const handleSettle = async () => {
    if (!grossAmount || Number(grossAmount) <= 0) {
      alert('Please enter gross payout amount.');
      return;
    }
    setSubmitting(true);
    try {
      await api.createPayment({
        type: 'receive',
        partyType: 'Customer',
        partyId: gatewayAccount._id,
        partyName: gatewayAccount.name,
        amount: netDeposited,
        mode: 'regular',
        paymentMethod: 'Bank Transfer',
        referenceNo: referenceNo.trim() || `SETTLE-${gatewayAccount.code}-${Date.now().toString().slice(-6)}`,
        notes: `Gateway Settlement Payout (${gatewayAccount.name}). Gross: ₹${grossAmount}, Gateway/Courier Fee Deducted: ₹${feeAmount || 0}. ${notes.trim()}`,
        date: new Date(date).toISOString(),
      });

      alert(`✓ Gateway Payout Settled Successfully! Net ₹${netDeposited.toLocaleString('en-IN')} deposited to Bank Account.`);
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Settlement failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={[styles.modalContent, { maxWidth: 520 }]}>
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="card-outline" size={20} color={colors.primary} />
              <Text style={styles.modalTitle}>Lump-Sum Gateway Settlement</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={{ fontSize: 11, color: colors.text.muted, marginBottom: 14, lineHeight: 15 }}>
              Reconcile bulk payouts received from Razorpay online gateway or Courier COD remittance directly into your Bank Account.
            </Text>

            <Text style={styles.label}>Select Gateway / Clearing Account *</Text>
            <View style={{ gap: 8, marginBottom: 14 }}>
              {GATEWAY_CLEARING_ACCOUNTS.map(g => (
                <TouchableOpacity
                  key={g._id}
                  style={{
                    padding: 10,
                    borderRadius: Radius.md,
                    borderWidth: 1,
                    borderColor: selectedGateway === g._id ? colors.primary : colors.border,
                    backgroundColor: selectedGateway === g._id ? colors.primary + '10' : colors.bg.primary,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                  onPress={() => setSelectedGateway(g._id)}
                >
                  <Text style={{ fontSize: 12, fontWeight: selectedGateway === g._id ? '700' : '500', color: selectedGateway === g._id ? colors.primary : colors.text.primary }}>
                    {g.name}
                  </Text>
                  {selectedGateway === g._id && <Ionicons name="checkmark-circle" size={16} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Gross Payout Amount *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 50000"
                  placeholderTextColor={colors.text.muted}
                  value={grossAmount}
                  onChangeText={setGrossAmount}
                  keyboardType="numeric"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Gateway / COD Fee</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 1000"
                  placeholderTextColor={colors.text.muted}
                  value={feeAmount}
                  onChangeText={setFeeAmount}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={{ backgroundColor: colors.success + '12', borderRadius: Radius.md, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: colors.success + '30' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: colors.success, textTransform: 'uppercase' }}>Net Bank Deposit</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.success, marginTop: 2 }}>
                ₹{netDeposited.toLocaleString('en-IN')}
              </Text>
              <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>
                (Gross ₹{Number(grossAmount || 0).toLocaleString('en-IN')} − Fee ₹{Number(feeAmount || 0).toLocaleString('en-IN')})
              </Text>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={styles.label}>Settlement Reference / UTR No.</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. UTR123456789 or Razorpay Payout ID"
                placeholderTextColor={colors.text.muted}
                value={referenceNo}
                onChangeText={setReferenceNo}
              />
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={styles.label}>Settlement Date</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.text.muted}
                value={date}
                onChangeText={setDate}
              />
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={submitting}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.success }, submitting && { opacity: 0.6 }]}
              onPress={handleSettle}
              disabled={submitting}
            >
              <Text style={styles.saveBtnText}>{submitting ? 'Settling...' : 'Reconcile Settlement'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function PaymentsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { width: winWidth } = useWindowDimensions();
  const canAccessCash = user?.canAccessCash ?? false;
  
  const [payments, setPayments] = useState<Payment[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [addType, setAddType] = useState<'receive' | 'make'>('receive');
  const [settleVisible, setSettleVisible] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  
  const [filterType, setFilterType] = useState<'all' | 'receive' | 'make'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const load = async () => {
    try {
      const res = await api.getPayments(undefined, undefined, undefined, filterType);
      const filtered = res.filter(p => 
        p.partyName.toLowerCase().includes(search.toLowerCase()) || 
        (p.referenceNo && p.referenceNo.toLowerCase().includes(search.toLowerCase()))
      );
      setPayments(filtered);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    load();
    const sub = DeviceEventEmitter.addListener('payment_updated_event', () => load());
    return () => sub.remove();
  }, [search, filterType]);

  const onRefresh = async () => {
    setRefreshing(true);
    api.clearCache();
    await load();
    setRefreshing(false);
  };

  const handleDelete = async (id: string) => {
    const doDelete = async () => {
      try {
        await api.deletePayment(id);
        load();
      } catch (err: any) {
        alert(err.message);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this payment? The balance will be reverted.')) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete Payment',
        'Are you sure you want to delete this payment? The balance will be reverted.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete }
        ]
      );
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.innerContainer}>
        {/* Header Actions & Filters */}
        <View style={{ zIndex: 1100, position: 'relative', paddingHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.xs }}>
          <View style={[styles.searchBar, { paddingRight: 8, paddingLeft: 12, marginBottom: 0 }]}>
            <Ionicons name="search" size={18} color={colors.text.muted} />
            <TextInput
              style={[styles.searchInput, { minWidth: 100 }]}
              placeholder="Search by party or reference..."
              placeholderTextColor={colors.text.muted}
              value={search}
              onChangeText={setSearch}
            />

            <View style={{ position: 'relative', zIndex: showFilterDropdown ? 1000 : 1 }}>
              <TouchableOpacity
                style={styles.filterDropdownButton}
                onPress={() => setShowFilterDropdown(!showFilterDropdown)}
              >
                <Text style={styles.filterDropdownButtonText}>
                  {filterType === 'all' ? 'All Types' : filterType === 'receive' ? 'Received' : 'Made'}
                </Text>
                <Ionicons name={showFilterDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.muted} />
              </TouchableOpacity>

              {showFilterDropdown && (
                <View style={[styles.filterDropdownPanel, { top: 40, right: 0 }]}>
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
                    {[
                      { id: 'all', label: 'All Types' },
                      { id: 'receive', label: 'Received' },
                      { id: 'make', label: 'Made' }
                    ].map(t => (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.filterDropdownItem, filterType === t.id && styles.filterDropdownItemActive]}
                        onPress={() => {
                          setFilterType(t.id as any);
                          setShowFilterDropdown(false);
                        }}
                      >
                        <Text style={[styles.filterDropdownItemText, filterType === t.id && { fontWeight: '700', color: colors.primary }]}>
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <TouchableOpacity
                style={{
                  height: 36,
                  paddingHorizontal: 12,
                  borderRadius: Radius.md,
                  backgroundColor: colors.primary + '18',
                  borderWidth: 1,
                  borderColor: colors.primary,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6
                }}
                onPress={() => setSettleVisible(true)}
              >
                <Ionicons name="card-outline" size={16} color={colors.primary} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Settle Gateway Payout</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.danger }]} onPress={() => { setAddType('make'); setAddVisible(true); }}>
                <Ionicons name="remove" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.success }]} onPress={() => { setAddType('receive'); setAddVisible(true); }}>
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Financial Summary Cards */}
        {(() => {
          const totalReceived = payments.filter(p => p.type === 'receive').reduce((sum, p) => sum + (p.amount || 0), 0);
          const totalPaid = payments.filter(p => p.type === 'make').reduce((sum, p) => sum + (p.amount || 0), 0);
          const netFlow = totalReceived - totalPaid;
          return (
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: Spacing.md, marginTop: 4, marginBottom: 8, flexWrap: 'wrap' }}>
              <View style={[styles.statCard, { backgroundColor: colors.success + '10', borderColor: colors.success + '30' }]}>
                <Text style={[styles.statLabel, { color: colors.success }]}>TOTAL RECEIVED</Text>
                <Text style={[styles.statValue, { color: colors.success }]}>₹{totalReceived.toLocaleString('en-IN')}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.danger + '10', borderColor: colors.danger + '30' }]}>
                <Text style={[styles.statLabel, { color: colors.danger }]}>TOTAL PAID OUT</Text>
                <Text style={[styles.statValue, { color: colors.danger }]}>₹{totalPaid.toLocaleString('en-IN')}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
                <Text style={[styles.statLabel, { color: colors.primary }]}>NET INFLOW</Text>
                <Text style={[styles.statValue, { color: colors.primary }]}>₹{netFlow.toLocaleString('en-IN')}</Text>
              </View>
            </View>
          );
        })()}

        {/* Table */}
        <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}>
          <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ width: '100%' }} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: Spacing.lg }}>
            <View style={[styles.tableCard, { minWidth: 950, width: '100%' }]}>
              <View style={styles.tableHeader}>
                <View style={[styles.tableHeaderCellContainer, { flex: 0.9, minWidth: 95 }]}><Text style={styles.th}>DATE</Text></View>
                <View style={[styles.tableHeaderCellContainer, { flex: 2.2, minWidth: 220 }]}><Text style={styles.th}>PARTY</Text></View>
                <View style={[styles.tableHeaderCellContainer, { flex: 1.3, minWidth: 140 }]}><Text style={styles.th}>METHOD/REF</Text></View>
                <View style={[styles.tableHeaderCellContainer, { flex: 1.1, minWidth: 110 }]}><Text style={[styles.th, { textAlign: 'right' }]}>AMOUNT</Text></View>
                <View style={[styles.tableHeaderCellContainer, { flex: 1.2, minWidth: 130, borderRightWidth: 0 }]}><Text style={[styles.th, { textAlign: 'center' }]}>ACTIONS</Text></View>
              </View>
              
              {[...payments].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => (
                <TouchableOpacity key={p._id} style={styles.tableRow} onPress={() => { setSelectedPayment(p); setDetailVisible(true); }}>
                  <View style={[styles.tableCellContainer, { flex: 0.9, minWidth: 95 }]}>
                    <Text style={[styles.td, { color: colors.text.secondary }]}>{new Date(p.date).toLocaleDateString('en-IN')}</Text>
                  </View>
                  <View style={[styles.tableCellContainer, { flex: 2.2, minWidth: 220 }]}>
                    <Text style={[styles.td, { fontWeight: '600' }]} numberOfLines={1}>{shortenPartyName(p.partyName, winWidth < 768)}</Text>
                    <Text style={[styles.td, { fontSize: 11, color: colors.text.muted, marginTop: 2 }]}>{p.partyType}</Text>
                  </View>
                  <View style={[styles.tableCellContainer, { flex: 1.3, minWidth: 140 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={styles.td}>{p.paymentMethod}</Text>
                      {canAccessCash && (
                        <View style={[styles.badge, { backgroundColor: p.mode === 'cash' ? '#FFF3E0' : colors.primaryLight }]}>
                          <Text style={[styles.badgeText, { color: p.mode === 'cash' ? '#F57C00' : colors.primary }]}>
                            {p.mode === 'cash' ? 'Cash' : 'Regular'}
                          </Text>
                        </View>
                      )}
                    </View>
                    {!!p.referenceNo && <Text style={[styles.td, { fontSize: 11, color: colors.text.muted, marginTop: 2 }]}>{p.referenceNo}</Text>}
                  </View>
                  <View style={[styles.tableCellContainer, { flex: 1.1, minWidth: 110 }]}>
                    <Text style={[styles.td, { textAlign: 'right', fontWeight: '800', color: p.type === 'receive' ? colors.success : colors.danger }]}>
                      {p.type === 'receive' ? '+ ' : '- '}₹{p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <View style={[styles.tableCellContainer, { flex: 1.2, minWidth: 130, borderRightWidth: 0, flexDirection: 'row', gap: 6, justifyContent: 'center' }]}>
                    <TouchableOpacity style={styles.actionPillBtn} onPress={() => { setSelectedPayment(p); setDetailVisible(true); }}>
                      <Ionicons name="eye-outline" size={12} color={colors.primary} />
                      <Text style={[styles.actionPillText, { color: colors.primary }]}>View</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionPillBtn, { backgroundColor: colors.danger + '12', borderColor: colors.danger + '40' }]} onPress={(e) => { e.stopPropagation(); handleDelete(p._id); }}>
                      <Ionicons name="trash-outline" size={12} color={colors.danger} />
                      <Text style={[styles.actionPillText, { color: colors.danger }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}

              {payments.length === 0 && (
                <View style={styles.emptyContainer}>
                  <Ionicons name="wallet-outline" size={32} color={colors.text.muted} />
                  <Text style={styles.emptyText}>No payments recorded.</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </ScrollView>
      </View>
      <AddPaymentModal visible={addVisible} onClose={() => setAddVisible(false)} onSaved={load} initialType={addType} />
      <SettleGatewayModal visible={settleVisible} onClose={() => setSettleVisible(false)} onSaved={load} />
      <PaymentDetailModal visible={detailVisible} payment={selectedPayment} onClose={() => setDetailVisible(false)} />
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  innerContainer: { flex: 1, width: '100%' },
  headerBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.card, paddingHorizontal: 14, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, gap: 10 },
  searchInput: { flex: 1, height: 46, color: colors.text.primary, fontSize: 14 },
  
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  filterDropdownButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, height: 36, gap: 6 },
  filterDropdownButtonText: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  filterDropdownPanel: { position: 'absolute', backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, width: 160, zIndex: 9999, boxShadow: '0px 6px 14px rgba(0,0,0,0.18)', elevation: 12 },
  filterDropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterDropdownItemActive: { backgroundColor: colors.primary + '08' },
  filterDropdownItemText: { fontSize: 13, color: colors.text.primary },

  tableCard: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: colors.bg.secondary, borderBottomWidth: 1, borderBottomColor: colors.border },
  th: { fontSize: 11, fontWeight: '700', color: colors.text.muted, letterSpacing: 0.5 },
  tableHeaderCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  tableRow: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: colors.border },
  td: { fontSize: 13, color: colors.text.primary },
  tableCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  statCard: { flex: 1, minWidth: 130, backgroundColor: colors.bg.card, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1 },
  statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  statValue: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  actionPillBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' },
  actionPillText: { fontSize: 11, fontWeight: '700' },
  iconBtn: { padding: 6 },
  emptyContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyText: { marginTop: 10, color: colors.text.muted, fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', maxWidth: 500, backgroundColor: colors.bg.card, borderRadius: Radius.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text.primary },
  closeBtn: { padding: 4 },
  modalBody: { padding: Spacing.lg },
  row: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  label: { fontSize: 12, fontWeight: '700', color: colors.text.secondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, backgroundColor: colors.bg.primary, color: colors.text.primary, fontSize: 14 },
  
  toggleGroup: { flexDirection: 'row', height: 44, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  toggleBtn: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg.primary },
  toggleText: { fontSize: 13, fontWeight: '600', color: colors.text.secondary },
  
  dropdownWrap: { position: 'relative' },
  dropdownList: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, marginTop: 4, maxHeight: 220, zIndex: 9999, elevation: 20, overflow: 'hidden', boxShadow: '0px 4px 12px rgba(0,0,0,0.18)' },
  dropdownItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  dropdownItemText: { fontSize: 13, fontWeight: '600', color: colors.text.primary },
  dropdownItemSub: { fontSize: 11, color: colors.text.muted, marginTop: 2 },

  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', padding: Spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: Radius.md, backgroundColor: colors.bg.secondary },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: Radius.md, backgroundColor: colors.primary },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' }
});
