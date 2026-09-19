import { DataTable, Column } from '../components/DataTable';
import { PageHeader } from './../components/PageHeader';
import { StatusPill, EmptyState } from './../components/WorkspacePrimitives';
import { PressableOpacity as TouchableOpacity } from './../components/PressableOpacity';
import { AppTextInput as TextInput } from '../components/AppTextInput';
import { ListToolbar } from '../components/ListToolbar';
import { useListState } from '../utils/useListState';
import { useLocalSearchParams } from 'expo-router';
import { useConfirm } from '../utils/ConfirmContext';
import { AppText as Text } from './../components/AppText';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Modal, KeyboardAvoidingView, Platform, Pressable, Alert, useWindowDimensions, DeviceEventEmitter } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors, Typography, Shadows } from '../constants/theme';
import { api, Payment, Customer, Vendor } from '../utils/api';
import { shortenPartyName } from '../utils/string';
import { useAuth } from '../utils/auth';
import { useTheme, useStyles } from '../utils/themeContext';
import { useDebouncedValue } from '../utils/useDebouncedValue';

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
                  <Text style={{ ...Typography.eyebrow, color: colors.text.muted, fontWeight: '700' }}>Current due balance</Text>
                  <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.primary, marginTop: 2 }}>
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
                  <Text style={{ ...Typography.caption, fontWeight: '700', color: colors.primary }}>Fill Due</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Amount */}
            <View style={{ marginBottom: Spacing.md }}>
              <Text style={styles.label}>Amount *</Text>
              <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0 }]}>
                <Text style={{ paddingLeft: 12, paddingRight: 4, color: colors.text.secondary, fontWeight: '700' }}>₹</Text>
                <TextInput
                  style={{ ...Typography.body, flex: 1, height: '100%', color: colors.text.primary }}
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
                  style: { ...Typography.body, flex: 1, height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', color: colors.text.primary }
                }) : (
                  <TextInput
                    style={{ ...Typography.body, flex: 1, height: '100%', color: colors.text.primary }}
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
              <Text style={{ ...Typography.bodySm, color: colors.text.muted, marginBottom: 4, fontWeight: '700' }}>Party</Text>
              <Text style={{ ...Typography.h3, color: colors.text.primary, fontWeight: '700' }}>{payment.partyName} <Text style={{ ...Typography.bodySm, fontWeight: '400', color: colors.text.muted }}>({payment.partyType})</Text></Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <View>
                <Text style={{ ...Typography.bodySm, color: colors.text.muted, marginBottom: 4, fontWeight: '700' }}>Date</Text>
                <Text style={{ ...Typography.body, color: colors.text.primary }}>{new Date(payment.date).toLocaleDateString('en-IN')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ ...Typography.bodySm, color: colors.text.muted, marginBottom: 4, fontWeight: '700' }}>Amount</Text>
                <Text style={{ ...Typography.h3, fontWeight: '800', color: payment.type === 'receive' ? colors.success : colors.danger }}>
                  {payment.type === 'receive' ? '+ ' : '- '}₹{payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <View>
                <Text style={{ ...Typography.bodySm, color: colors.text.muted, marginBottom: 4, fontWeight: '700' }}>Mode & Method</Text>
                <Text style={{ ...Typography.body, color: colors.text.primary }}>{payment.mode === 'regular' ? 'GST (Regular)' : 'Cash'} - {payment.paymentMethod}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ ...Typography.bodySm, color: colors.text.muted, marginBottom: 4, fontWeight: '700' }}>Reference No</Text>
                <Text style={{ ...Typography.body, color: colors.text.primary }}>{payment.referenceNo || 'N/A'}</Text>
              </View>
            </View>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ ...Typography.bodySm, color: colors.text.muted, marginBottom: 4, fontWeight: '700' }}>Notes</Text>
              <Text style={{ ...Typography.body, color: colors.text.primary }}>{payment.notes || 'None'}</Text>
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

      alert(` Gateway Payout Settled Successfully! Net ₹${netDeposited.toLocaleString('en-IN')} deposited to Bank Account.`);
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
            <Text style={{ ...Typography.caption, color: colors.text.muted, marginBottom: 14 }}>
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
                  <Text style={{ ...Typography.bodySm, fontWeight: selectedGateway === g._id ? '700' : '500', color: selectedGateway === g._id ? colors.primary : colors.text.primary }}>
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
              <Text style={{ ...Typography.eyebrow, fontWeight: '700', color: colors.success }}>Net Bank Deposit</Text>
              <Text style={{ ...Typography.h2, fontWeight: '800', color: colors.success, marginTop: 2 }}>
                ₹{netDeposited.toLocaleString('en-IN')}
              </Text>
              <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginTop: 2 }}>
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
  const { confirm } = useConfirm();
  const { width: winWidth } = useWindowDimensions();
  const canAccessCash = user?.canAccessCash ?? false;
  
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // Initial-load flag so DataTable can show its skeleton instead of an empty table.
  const [loading, setLoading] = useState(true);
  const [addVisible, setAddVisible] = useState(false);
  const [addType, setAddType] = useState<'receive' | 'make'>('receive');
  const [settleVisible, setSettleVisible] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  
  const [search, setSearch] = useListState('payments_search', '');
  
  const params = useLocalSearchParams<{ search?: string }>();
  useEffect(() => {
    if (params.search && params.search !== search) {
      setSearch(params.search);
    }
  }, [params.search]);

  const debouncedSearch = useDebouncedValue(search, 300);
  const [activeTab, setActiveTab] = useListState<'all' | 'receive' | 'pay' | 'gateway'>('payments_tab', 'all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  
  const [page, setPage] = useListState('payments_page', 1);
  const [filterType, setFilterType] = useState<'all' | 'receive' | 'make'>('all');

  const load = async () => {
    try {
      const res = await api.getPayments(undefined, undefined, undefined, filterType);
      const filtered = res.filter(p => 
        p.partyName.toLowerCase().includes(debouncedSearch.toLowerCase()) || 
        (p.referenceNo && p.referenceNo.toLowerCase().includes(debouncedSearch.toLowerCase()))
      );
      setPayments(filtered);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const sub = DeviceEventEmitter.addListener('payment_updated_event', () => load());
    return () => sub.remove();
  }, [debouncedSearch, filterType]);

  const onRefresh = async () => {
    setRefreshing(true);
    api.clearCache();
    await load();
    setRefreshing(false);
  };

  const handleDelete = (id: string) => {
    confirm({
      title: 'Delete Payment',
      description: 'Are you sure you want to delete this payment? The balance will be reverted.',
      destructive: true,
      iconName: 'trash',
      onConfirm: async () => {
        try {
          await api.deletePayment(id);
          load();
        } catch (err: any) {
          alert(err.message);
        }
      }
    });
  };

  const sortedPayments = [...payments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const columns: Column<Payment>[] = [
    {
      key: 'date',
      title: 'Date',
      width: 120,
      hideOnMobile: true,
      render: (p) => <Text style={{ ...Typography.bodySm, color: colors.text.primary }}>{new Date(p.date).toLocaleDateString('en-IN')}</Text>
    },
    {
      key: 'partyName',
      title: 'Party Name',
      flex: 2,
      width: 200,
      render: (p) => (
        <View>
          <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.primary }} numberOfLines={1}>{p.partyName}</Text>
          <Text style={{ ...Typography.eyebrow, color: colors.text.muted }}>{p.partyType}</Text>
        </View>
      )
    },
    {
      key: 'type',
      title: 'Type',
      width: 100,
      render: (p) => (
        <StatusPill  label={<>
            {p.type === 'receive' ? 'RECEIVED' : 'PAID'}
          </>} tone={p.type === 'receive' ? 'success' : 'danger'} />
      )
    },
    {
      key: 'mode',
      title: 'Mode',
      width: 100,
      hideOnMobile: true,
      render: (p) => (
        <Text style={{ ...Typography.bodySm, color: colors.text.secondary }}>{p.mode === 'regular' ? 'GST' : 'Cash'} ({p.paymentMethod})</Text>
      )
    },
    {
      key: 'amount',
      title: 'Amount',
      width: 120,
      align: 'right',
      render: (p) => (
        <Text style={{ ...Typography.bodySm, fontWeight: '800', color: p.type === 'receive' ? colors.success : colors.danger }}>
          {p.type === 'receive' ? '+' : '-'} ₹{p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </Text>
      )
    },
    {
      key: 'action',
      title: 'Action',
      width: 90,
      align: 'center',
      render: (p) => (
        <TouchableOpacity style={styles.actionPillBtn} onPress={() => { setSelectedPayment(p); setDetailVisible(true); }}>
          <Text style={[styles.actionPillText, { color: colors.primary }]}>View</Text>
        </TouchableOpacity>
      )
    }
  ];

  return (
    <View style={styles.screen}>
      <PageHeader 
        title="Payments & Clearings" 
        subtitle="Manage incoming receipts and outgoing payments."
      />
      <View style={styles.innerContainer}>
        {/* Header Actions & Filters */}
        <View style={{ zIndex: 1100, position: 'relative', marginBottom: Spacing.xs }}>
          <ListToolbar
            searchValue={search}
            onSearchChange={setSearch}
            itemCount={sortedPayments ? sortedPayments.length : 0}
            searchPlaceholder="Search by party or reference..."
            renderFilters={() => (
              <View style={{ position: 'relative', zIndex: showFilterDropdown ? 1000 : 1 }}>
                <TouchableOpacity
                  style={[styles.filterDropdownButton, { borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 4 }]}
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
            )}
            renderActions={() => (
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <TouchableOpacity
                  style={{
                    height: 34,
                    paddingHorizontal: 10,
                    borderRadius: Radius.sm,
                    backgroundColor: colors.primary + '15',
                    borderColor: colors.primary + '30',
                    borderWidth: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4
                  }}
                  onPress={() => setSettleVisible(true)}
                >
                  <Ionicons name="card-outline" size={16} color={colors.primary} />
                  <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.primary }}>Settle Gateway Payout</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.danger }]} onPress={() => { setAddType('make'); setAddVisible(true); }}>
                  <Ionicons name="remove" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.success }]} onPress={() => { setAddType('receive'); setAddVisible(true); }}>
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          />
        </View>

        {/* Financial Summary Cards */}
        {(() => {
          const totalReceived = payments.filter(p => p.type === 'receive').reduce((sum, p) => sum + (p.amount || 0), 0);
          const totalPaid = payments.filter(p => p.type === 'make').reduce((sum, p) => sum + (p.amount || 0), 0);
          const netFlow = totalReceived - totalPaid;
          return (
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: Spacing.md, marginTop: 4, marginBottom: 8, flexWrap: 'wrap' }}>
              <View style={[styles.statCard, { backgroundColor: colors.success + '10', borderColor: colors.success + '30' }]}>
                <Text style={[styles.statLabel, { color: colors.success }]}>Total received</Text>
                <Text style={[styles.statValue, { color: colors.success }]}>₹{totalReceived.toLocaleString('en-IN')}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.danger + '10', borderColor: colors.danger + '30' }]}>
                <Text style={[styles.statLabel, { color: colors.danger }]}>Total paid out</Text>
                <Text style={[styles.statValue, { color: colors.danger }]}>₹{totalPaid.toLocaleString('en-IN')}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
                <Text style={[styles.statLabel, { color: colors.primary }]}>Net inflow</Text>
                <Text style={[styles.statValue, { color: colors.primary }]}>₹{netFlow.toLocaleString('en-IN')}</Text>
              </View>
            </View>
          );
        })()}

        {/* DataTable */}
        <View style={{ flex: 1, marginHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
          <DataTable
            data={sortedPayments}
            columns={columns}
            keyExtractor={item => item._id}
            isLoading={loading}
            isRefreshing={refreshing}
            onRefresh={onRefresh}
            onRowPress={(p) => { setSelectedPayment(p); setDetailVisible(true); }}
            ListEmptyComponent={
              <EmptyState 
                title={search ? <>No payments found for "{search}"</> : <>No payments recorded</>} 
                message={!search ? <>Record your first payment to track cash flow.</> : undefined}
                actionLabel={!search ? 'Record Payment' : 'Clear Search'}
                onAction={!search ? () => setAddVisible(true) : () => setSearch('')}
              />
            }
          />
        </View>
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
  searchInput: { borderWidth: 0, backgroundColor: 'transparent', ...Typography.body, flex: 1, height: 46, color: colors.text.primary },
  
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  filterDropdownButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, height: 36, gap: 6 },
  filterDropdownButtonText: { ...Typography.bodySm, fontWeight: '700', color: colors.text.secondary },
  filterDropdownPanel: { position: 'absolute', backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, width: 160, zIndex: 9999, ...Shadows.floating },
  filterDropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterDropdownItemActive: { backgroundColor: colors.primary + '08' },
  filterDropdownItemText: { ...Typography.bodySm, color: colors.text.primary },

  tableCard: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: colors.bg.secondary, borderBottomWidth: 1, borderBottomColor: colors.border },
  th: { ...Typography.caption, fontWeight: '700', color: colors.text.muted },
  tableHeaderCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  tableRow: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: colors.border },
  td: { ...Typography.bodySm, color: colors.text.primary },
  tableCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { ...Typography.eyebrow, fontWeight: '700' },
  statCard: { flex: 1, minWidth: 130, backgroundColor: 'transparent', borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 0 },
  statLabel: { ...Typography.eyebrow, fontWeight: '700' },
  statValue: { ...Typography.h3, fontWeight: '800', marginTop: 2 },
  actionPillBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' },
  actionPillText: { ...Typography.caption, fontWeight: '700' },
  iconBtn: { padding: 6 },
  emptyContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyText: { ...Typography.body, marginTop: 10, color: colors.text.muted },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', maxWidth: 500, backgroundColor: colors.bg.card, borderRadius: Radius.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  modalTitle: { ...Typography.h3, fontWeight: '800', color: colors.text.primary },
  closeBtn: { padding: 4 },
  modalBody: { padding: Spacing.lg },
  row: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  label: { ...Typography.bodySm, fontWeight: '700', color: colors.text.secondary, marginBottom: 6 },
  input: { ...Typography.body, height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, backgroundColor: colors.bg.primary, color: colors.text.primary },
  
  toggleGroup: { flexDirection: 'row', height: 44, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  toggleBtn: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg.primary },
  toggleText: { ...Typography.bodySm, fontWeight: '600', color: colors.text.secondary },
  
  dropdownWrap: { position: 'relative' },
  dropdownList: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, marginTop: 4, maxHeight: 220, zIndex: 9999, ...Shadows.modal, overflow: 'hidden' },
  dropdownItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  dropdownItemText: { ...Typography.bodySm, fontWeight: '600', color: colors.text.primary },
  dropdownItemSub: { ...Typography.caption, color: colors.text.muted, marginTop: 2 },

  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: Spacing.lg, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, gap: 8, backgroundColor: colors.bg.card },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: Radius.md, backgroundColor: colors.bg.secondary },
  cancelBtnText: { ...Typography.body, fontWeight: '600', color: colors.text.primary },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: Radius.md, backgroundColor: colors.primary },
  saveBtnText: { ...Typography.body, fontWeight: '700', color: '#fff' }
});
