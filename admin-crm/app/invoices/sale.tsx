import { StatusPill, EmptyState } from './../../components/WorkspacePrimitives';
import { PressableOpacity as TouchableOpacity } from './../../components/PressableOpacity';
import { AppTextInput as TextInput } from './../../components/AppTextInput';
import { AppText as Text } from './../../components/AppText';
import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Modal, FlatList, KeyboardAvoidingView, Platform, Linking, Pressable, DeviceEventEmitter, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Spacing, Radius, LightColors, Typography } from '../../constants/theme';
import { api, Invoice, Product, Customer, Warehouse, InventoryEntry, InvoiceItem } from '../../utils/api';
import { shortenPartyName } from '../../utils/string';
import { getStateStrWithCode } from '../../utils/gst';
import { useAuth } from '../../utils/auth';
import { usePermission } from '../../utils/permissions';
import { useTheme, useStyles } from '../../utils/themeContext';
import { LOGO_BASE64 } from '../../utils/logo';
import { FIRM_DETAILS } from '../../constants/firm';
import { printInvoice } from '../../utils/printInvoiceTemplate';
import { useToast } from '../../utils/ToastContext';
import { useDebouncedValue } from '../../utils/useDebouncedValue';
import { DataTable, Column } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';

import { PageHeader } from '../../components/PageHeader';
import { useConfirm } from '../../utils/ConfirmContext';
import { useListState } from '../../utils/useListState';
import { useLocalSearchParams } from 'expo-router';

const getFinancialYearString = (date: Date): string => {
  const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
};

// ── Share on WhatsApp ──────────────────────────────────────────────────────────
const shareInvoiceOnWhatsApp = (invoice: Invoice, customers: Customer[]) => {
  // Find the customer phone number by matching customer name
  const customer = customers.find(c =>
    (c.company || c.name || '').trim().toLowerCase() === (invoice.customerName || '').trim().toLowerCase()
  );
  const rawPhone = customer?.phone || '';
  // Sanitize phone: strip spaces, dashes, parentheses, leading zeros, add country code
  const phone = rawPhone.replace(/[\s\-().+]/g, '').replace(/^0+/, '');
  const phoneWithCode = phone ? (phone.startsWith('91') ? phone : `91${phone}`) : '';

  const amount = invoice.amount || invoice.baseAmount || 0;
  const dateStr = new Date(invoice.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const docType = 'Tax Invoice';
  const message = `Dear ${invoice.customerName},\n\nPlease find attached your ${docType}.\n\n Invoice No: ${invoice.invoiceNo}\n Date: ${dateStr}\n Amount: ₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\nThank you for your business!\n\n— ${FIRM_DETAILS.name}`;

  // First open the PDF in a new window
  if (Platform.OS === 'web') {
    printInvoice(invoice);
  }

  // Then open WhatsApp
  if (!phoneWithCode) {
    alert(`No phone number found for customer "${invoice.customerName}". Please update the customer record with a phone number.`);
    return;
  }
  const waUrl = `https://wa.me/${phoneWithCode}?text=${encodeURIComponent(message)}`;
  if (Platform.OS === 'web') {
    setTimeout(() => window.open(waUrl, '_blank'), 800);
  } else {
    Linking.openURL(waUrl).catch(() => {
      Linking.openURL(`whatsapp://send?phone=${phoneWithCode}&text=${encodeURIComponent(message)}`);
    });
  }
};
// ── End Share ──────────────────────────────────────────────────────────────────

interface ExtendedInvoiceItem extends InvoiceItem {
  maxQty?: number;
  rateText?: string;
  mrpText?: string;
  discountText?: string;
}

const toTitleCase = (str?: string) => {
  if (!str) return '';
  return str
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

const formatSize = (size?: string) => {
  if (!size) return '';
  const cleaned = size.replace(/[\s.]+/g, '').toUpperCase();
  return cleaned ? `${cleaned}.` : '';
};

const formatWeight = (weight?: string) => {
  if (!weight) return '';
  let w = weight.replace(/\s+/g, '').toLowerCase();
  if (w.endsWith('gms')) {
    w = w.slice(0, -3) + 'g';
  } else if (!w.endsWith('g')) {
    w += 'g';
  }
  return w;
};

function InvoiceDetailModal({ invoice, visible, onClose, onDeleted, onEdit }: { invoice: Invoice | null; visible: boolean; onClose: () => void; onDeleted: () => void; onEdit: (invoice: Invoice) => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuth();
  const perm = usePermission();
  const { confirm } = useConfirm();

  if (!invoice) return null;

  const handleUploadInvoiceDoc = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const dataUrl = reader.result as string;
              const uploadRes = await api.uploadFile(dataUrl, file.name);
              await api.addDocument('invoice', invoice._id, {
                name: uploadRes.name,
                url: uploadRes.url
              });
              onDeleted();
              onClose();
            } catch (err: any) {
              alert(err.message || 'Failed to upload document');
            }
          };
          reader.readAsDataURL(file);
        } catch (err: any) {
          alert('Failed to read file');
        }
      };
      input.click();
    } else {
      Alert.prompt(
        'Attach Document',
        'Enter document or receiving copy URL:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Attach',
            onPress: async (url?: string) => {
              if (!url) return;
              try {
                await api.addDocument('invoice', invoice._id, { name: 'Attached Receiving Copy', url });
                onDeleted();
                onClose();
              } catch (err: any) {
                alert(err.message || 'Failed to attach document');
              }
            }
          }
        ]
      );
    }
  };

  const handleDeleteInvoiceDoc = (url: string) => {
    confirm({
      title: 'Delete Document',
      description: 'Are you sure you want to delete this document?',
      destructive: true,
      iconName: 'trash',
      onConfirm: async () => {
        try {
          await api.deleteDocument('invoice', invoice._id, url);
          onDeleted();
          onClose();
        } catch (err: any) {
          alert(err.message || 'Failed to delete document');
        }
      }
    });
  };

  const handleDelete = () => {
    confirm({
      title: 'Delete Invoice',
      description: 'Are you sure you want to delete this invoice?',
      destructive: true,
      iconName: 'trash',
      onConfirm: async () => {
        try {
          const success = await api.deleteSaleInvoice(invoice._id);
          if (success) {
            onDeleted();
            onClose();
          }
        } catch (err: any) {
          alert(err.message || 'Failed to delete invoice');
        }
      }
    });
  };

  const isOutstanding = invoice.status !== 'paid';

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <PageHeader 
          title="Sale Invoice"
          subtitle={invoice.invoiceNo}
          breadcrumbs={[{ label: 'Sales Invoices', onPress: onClose }, { label: invoice.invoiceNo || 'Details' }]}
          backButton={onClose}
          style={{ paddingHorizontal: Spacing.lg, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary }}
        />

        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          <View style={styles.profileHeader}>
            <View style={styles.profileAvatar}>
              <Ionicons name="receipt" size={36} color={colors.primary} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginVertical: 4 }}>
              <Text style={styles.profileName}>{invoice.invoiceNo}</Text>
              <TouchableOpacity
                style={{
                  backgroundColor: colors.success + '15',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: colors.success,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4
                }}
                onPress={handleUploadInvoiceDoc}
              >
                <Ionicons name="cloud-upload-outline" size={13} color={colors.success} />
                <Text style={{ ...Typography.eyebrow, color: colors.success, fontWeight: '700' }}>Upload POD / Rec Copy</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.profileCustomer}>{invoice.customerName}</Text>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.successLight }]}>
                <Ionicons name="pricetag" size={16} color={colors.success} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Billing Mode</Text>
                <Text style={[styles.infoValue, { color: colors.success }]}>
                  INVOICE
                </Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.successLight }]}>
                <Ionicons name="cash" size={16} color={colors.success} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Total Amount</Text>
                <Text style={styles.infoValue}>₹{invoice.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              </View>
            </View>

            {invoice.mode === 'regular' && (
              <>
                <View style={styles.infoItem}>
                  <View style={[styles.infoIcon, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="calculator-outline" size={16} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>GST Breakdown</Text>
                    <Text style={styles.infoValue}>
                      Base: ₹{invoice.baseAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'} | Rate: {invoice.gstRate || 0}%
                    </Text>
                    {invoice.igst && invoice.igst > 0 ? (
                      <Text style={{ ...Typography.caption, color: colors.text.secondary }}>
                        IGST: ₹{invoice.igst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Inter-state)
                      </Text>
                    ) : (
                      <Text style={{ ...Typography.caption, color: colors.text.secondary }}>
                        CGST: ₹{(invoice.cgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | SGST: ₹{(invoice.sgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Intra-state)
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.infoItem}>
                  <View style={[styles.infoIcon, { backgroundColor: colors.infoLight }]}>
                    <Ionicons name="map-outline" size={16} color={colors.info} />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>State of Supply & Party GSTIN</Text>
                    <Text style={styles.infoValue}>
                      State: {getStateStrWithCode(invoice.stateOfSupply)} | GSTIN: {invoice.gstin || 'None'}
                    </Text>
                  </View>
                </View>
              </>
            )}
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="calendar" size={16} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Invoice Date</Text>
                <Text style={styles.infoValue}>{new Date(invoice.date).toLocaleDateString()} {new Date(invoice.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: isOutstanding ? colors.warningLight : colors.successLight }]}>
                <Ionicons name="shield-checkmark" size={16} color={isOutstanding ? colors.warning : colors.success} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Payment Status</Text>
                <Text style={[styles.infoValue, { color: isOutstanding ? colors.warning : colors.success }]}>
                  {invoice.status.toUpperCase()}
                </Text>
              </View>
            </View>
            {invoice.internalFreightExpense && invoice.internalFreightExpense > 0 ? (
              <View style={styles.infoItem}>
                <View style={[styles.infoIcon, { backgroundColor: colors.warningLight }]}>
                  <Ionicons name="cube-outline" size={16} color={colors.warning} />
                </View>
                <View>
                  <Text style={styles.infoLabel}>Internal Freight Exp.</Text>
                  <Text style={styles.infoValue}>₹{invoice.internalFreightExpense.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: invoice.isFinalized ? colors.successLight : colors.warningLight }]}>
                <Ionicons name={invoice.isFinalized ? "lock-closed" : "document-text"} size={16} color={invoice.isFinalized ? colors.success : colors.warning} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Document Status</Text>
                <Text style={[styles.infoValue, { color: invoice.isFinalized ? colors.success : colors.warning }]}>
                  {invoice.isFinalized ? 'FINALIZED' : 'DRAFT'}
                </Text>
              </View>
            </View>

            {/* Dispatch Record Reference Info */}
            {(invoice as any).dispatch && (
              <View style={{ backgroundColor: colors.bg.secondary, borderRadius: 8, padding: 12, marginTop: 4, borderWidth: 1, borderColor: colors.border, width: '100%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Ionicons name="bus-outline" size={16} color={colors.primary} />
                  <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.primary }}> DISPATCH & COURIER INFORMATION</Text>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 6 }}>
                  <Text style={{ ...Typography.bodySm, color: colors.text.secondary }}>Dispatch No: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{(invoice as any).dispatch.dispatchNo}</Text></Text>
                  <Text style={{ ...Typography.bodySm, color: colors.text.secondary }}>Status: <Text style={{ fontWeight: '700', color: colors.success }}>{(invoice as any).dispatch.status.toUpperCase()}</Text></Text>

                  {((invoice as any).dispatch.transporter || (invoice as any).dispatch.courierName) ? (
                    <Text style={{ ...Typography.bodySm, color: colors.text.secondary }}>Carrier: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{(invoice as any).dispatch.transporter || (invoice as any).dispatch.courierName}</Text></Text>
                  ) : null}

                  {(invoice as any).dispatch.lrNo ? (
                    <Text style={{ ...Typography.bodySm, color: colors.text.secondary }}>LR/GR No: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{(invoice as any).dispatch.lrNo}</Text></Text>
                  ) : null}

                  {(invoice as any).dispatch.vehicleNo ? (
                    <Text style={{ ...Typography.bodySm, color: colors.text.secondary }}>Vehicle: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{(invoice as any).dispatch.vehicleNo}</Text></Text>
                  ) : null}

                  {(invoice as any).dispatch.trackingId ? (
                    <Text style={{ ...Typography.bodySm, color: colors.text.secondary }}>Tracking ID: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{(invoice as any).dispatch.trackingId}</Text></Text>
                  ) : null}

                  {(invoice as any).dispatch.totalBoxes ? (
                    <Text style={{ ...Typography.bodySm, color: colors.text.secondary }}>Boxes: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{(invoice as any).dispatch.totalBoxes}</Text></Text>
                  ) : null}

                  {(invoice as any).dispatch.totalWeight ? (
                    <Text style={{ ...Typography.bodySm, color: colors.text.secondary }}>Weight: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{(invoice as any).dispatch.totalWeight}</Text></Text>
                  ) : null}
                </View>

                {Platform.OS === 'web' && (invoice as any).dispatch.trackingUrl ? (
                  <TouchableOpacity
                    onPress={() => window.open((invoice as any).dispatch.trackingUrl, '_blank')}
                    style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
                  >
                    <Ionicons name="open-outline" size={13} color={colors.primary} />
                    <Text style={{ ...Typography.caption, color: colors.primary, fontWeight: '700', textDecorationLine: 'underline' }}>Track shipment online</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>

          <Text style={styles.sectionTitle}>Items Details</Text>
          <View style={styles.itemsCard}>
            {(invoice.items || []).map((it, idx) => {
              const rate = it.rate || 0;
              const packing = it.packing || 1;
              const sub = it.qty * rate * packing;
              return (
                <View key={idx} style={[styles.itemRowDetail, idx < (invoice.items || []).length - 1 && styles.itemRowBorder]}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.itemNameText}>{it.name}</Text>
                    <Text style={styles.itemSubTextDetail}>
                      {it.hsnCode ? `HSN: ${it.hsnCode} | ` : ''}{it.discountPercent && it.discountPercent > 0 ? `MRP: ₹${(it.mrp || rate).toFixed(2)} (Disc: ${it.discountPercent}%) | Net: ` : ''}Rate: ₹{rate.toFixed(2)}/pc | Qty: {it.qty} boxes {it.packing !== undefined && it.packing > 1 ? `(${it.packing} pcs/box)` : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      {(it as any).batchNo ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="barcode-outline" size={11} color={colors.primary} />
                          <Text style={{ ...Typography.eyebrow, fontWeight: '700', color: colors.primary }}>
                            Batch: {(it as any).batchNo}
                          </Text>
                        </View>
                      ) : null}
                      {(it as any).expiryDate ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="calendar-outline" size={11} color={colors.danger} />
                          <Text style={{ ...Typography.eyebrow, fontWeight: '600', color: colors.danger }}>
                            Exp: {new Date((it as any).expiryDate).toLocaleDateString('en-IN')}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
                    <Text style={styles.itemQtyText}>₹{sub.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                </View>
              );
            })}

            {invoice.mode === 'regular' && ((invoice.cgst || 0) > 0 || (invoice.sgst || 0) > 0 || (invoice.igst || 0) > 0) ? (
              <View style={{ borderTopWidth: 2, borderTopColor: colors.border, paddingTop: 10, marginTop: 4, gap: 6, paddingBottom: 10 }}>
                {(invoice.totalMrp || 0) > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[styles.itemNameText, { ...Typography.bodySm, color: colors.text.muted }]}>Total Item MRP</Text>
                    <Text style={[styles.itemQtyText, { ...Typography.bodySm, color: colors.text.muted }]}>
                      ₹{(invoice.totalMrp || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                )}
                {(invoice.totalDiscount || 0) > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.itemNameText, { ...Typography.bodySm, fontWeight: '600', color: colors.success }]}>Total Discount Saved</Text>
                    <Text style={[styles.itemQtyText, { ...Typography.bodySm, fontWeight: '700', color: colors.success }]}>
                      - ₹{(invoice.totalDiscount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[styles.itemNameText, { ...Typography.bodySm, color: colors.text.secondary }]}>Taxable Base Amount</Text>
                  <Text style={[styles.itemQtyText, { ...Typography.bodySm, color: colors.text.secondary }]}>
                    ₹{(invoice.baseAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
                {(invoice.cgst || 0) > 0 || (invoice.sgst || 0) > 0 ? (
                  <>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[styles.itemNameText, { ...Typography.caption, color: colors.text.muted }]}>CGST</Text>
                      <Text style={[styles.itemQtyText, { ...Typography.caption, color: colors.text.muted }]}>
                        ₹{(invoice.cgst || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[styles.itemNameText, { ...Typography.caption, color: colors.text.muted }]}>SGST</Text>
                      <Text style={[styles.itemQtyText, { ...Typography.caption, color: colors.text.muted }]}>
                        ₹{(invoice.sgst || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  </>
                ) : (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[styles.itemNameText, { ...Typography.caption, color: colors.text.muted }]}>IGST</Text>
                    <Text style={[styles.itemQtyText, { ...Typography.caption, color: colors.text.muted }]}>
                      ₹{(invoice.igst || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 }}>
                  <Text style={[styles.itemNameText, { ...Typography.body, fontWeight: '800' }]}>Nett Total</Text>
                  <Text style={[styles.itemQtyText, { ...Typography.h3, color: colors.success }]}>
                    ₹{(invoice.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={[styles.itemRowDetail, { borderTopWidth: 2, borderTopColor: colors.border, paddingVertical: 14, marginTop: 4 }]}>
                <Text style={[styles.itemNameText, { ...Typography.body, fontWeight: '800' }]}>Grand Total</Text>
                <Text style={[styles.itemQtyText, { ...Typography.h3, color: colors.success }]}>
                  ₹{(invoice.amount || invoice.baseAmount || (invoice.items || []).reduce((acc, it) => acc + (it.qty * (it.rate || 0) * (it.packing || 1)), 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            )}
          </View>

          {/* Action Buttons Row (Single row layout for Desktop) */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24, marginBottom: 16 }}>
            {/* Finalize Button */}
            {!invoice.isFinalized && (
              <TouchableOpacity
                style={[styles.printBtn, { flex: 1, minWidth: 140, marginTop: 0, backgroundColor: colors.success }]}
                onPress={async () => {
                  try {
                    const val = invoice.amount || invoice.baseAmount || 0;
                    if (val > 49999 && !invoice.ewayBillNo) {
                      alert('GST Compliance Error: E-Way Bill No. is mandatory for invoices exceeding ₹49,999.');
                      return;
                    }
                    await api.finalizeSaleInvoice(invoice._id);
                    onDeleted(); // Reload parent
                    onClose();
                  } catch (err: any) {
                    alert(err.message || 'Failed to finalize invoice');
                  }
                }}
              >
                <Ionicons name="checkmark-done-circle" size={18} color="#fff" />
                <Text style={styles.printBtnText}>Finalize Invoice</Text>
              </TouchableOpacity>
            )}

            {/* Edit Button */}
            {!invoice.isFinalized && (
              <TouchableOpacity
                style={[styles.printBtn, { flex: 1, minWidth: 140, marginTop: 0, backgroundColor: colors.info }]}
                onPress={() => {
                  onClose();
                  onEdit(invoice);
                }}
              >
                <Ionicons name="create-outline" size={18} color="#fff" />
                <Text style={styles.printBtnText}>Edit Draft</Text>
              </TouchableOpacity>
            )}

            {/* Payments must be recorded through the Payments workflow so invoice and customer ledgers remain consistent. */}
            {invoice.isFinalized && invoice.status?.toLowerCase() !== 'paid' && (
              <>
                <TouchableOpacity
                  style={[styles.printBtn, { flex: 1, minWidth: 140, marginTop: 0, backgroundColor: colors.success }]}
                  onPress={() => { onClose(); router.push('/payments'); }}
                >
                  <Ionicons name="cash-outline" size={18} color="#fff" />
                  <Text style={styles.printBtnText}>Record Payment</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.printBtn, { flex: 1, minWidth: 140, marginTop: 0, backgroundColor: colors.primary }]}
                  onPress={async () => {
                    try {
                      const orderData = await api.createPaymentOrder(invoice._id);
                      if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        const script = document.createElement('script');
                        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
                        script.onload = () => {
                          const options = {
                            key: orderData.keyId, amount: orderData.amount, currency: orderData.currency,
                            name: 'Shekhar Bandhu Aushadhalaya', description: `Invoice ${orderData.invoiceNo}`, order_id: orderData.orderId,
                            prefill: { name: orderData.customerName, email: orderData.customerEmail, contact: orderData.customerPhone },
                            handler: async (response: any) => {
                              const verify = await api.verifyPayment({
                                razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature, invoiceId: invoice._id,
                              });
                              if (verify.success) { alert('Payment recorded successfully.'); onDeleted(); onClose(); }
                            },
                            modal: { ondismiss: () => { } },
                          };
                          const rzp = new (window as any).Razorpay(options);
                          rzp.open();
                        };
                        document.body.appendChild(script);
                      } else {
                        alert('Online payment is available on web. Use Record Payment for manual receipts.');
                      }
                    } catch (err: any) { alert(err.message || 'Failed to initiate payment'); }
                  }}
                >
                  <Ionicons name="globe-outline" size={18} color="#fff" />
                  <Text style={styles.printBtnText}>Pay Online</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={[styles.printBtn, { flex: 1, minWidth: 140, marginTop: 0, backgroundColor: colors.primary }]}
              onPress={() => printInvoice(invoice)}
            >
              <Ionicons name="print-outline" size={18} color="#fff" />
              <Text style={styles.printBtnText}>Print Invoice</Text>
            </TouchableOpacity>

            {perm.can('invoice:delete') && invoice.status !== 'Cancelled' && (
              <TouchableOpacity style={[styles.deleteBtn, { flex: 1, minWidth: 140, marginTop: 0, marginBottom: 0 }]} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={16} color="#fff" />
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function AddInvoiceModal({ visible, onClose, onSaved, invoiceToEdit }: { visible: boolean; onClose: () => void; onSaved: () => void; invoiceToEdit?: Invoice | null }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const perm = usePermission();
  const styles = useStyles(createStyles);
  const canAccessCash = user?.canAccessCash ?? false;

  const [invoiceNo, setInvoiceNo] = useState('');
  const [customerName, setPartyName] = useState('');
  const [partyAddress, setPartyAddress] = useState('');
  const [date, setDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState('');
  const [showTermsDropdown, setShowTermsDropdown] = useState(false);
  const [shippingAddress, setShippingAddress] = useState('');
  const [transport, setTransport] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [ewayBillNo, setEwayBillNo] = useState('');
  const [irn, setIrn] = useState('');
  const [partyCity, setPartyCity] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [showWarehouseDropdown, setShowWarehouseDropdown] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseInventory, setWarehouseInventory] = useState<InventoryEntry[]>([]);
  const [status, setStatus] = useState('draft');
  const mode = 'regular';
  const [internalFreightExpense, setInternalFreightExpense] = useState('');
  const [customerState, setCustomerState] = useState('Uttar Pradesh');
  const [overridePaymentTerms, setOverridePaymentTerms] = useState(false);

  // Customer & Product lists for selection
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [activeItemDropdownIdx, setActiveItemDropdownIdx] = useState<number | null>(null);
  const [itemSearchText, setItemSearchText] = useState('');

  const [items, setItems] = useState<ExtendedInvoiceItem[]>([{ name: '', qty: 1, boxes: 1, rate: 0, packing: 1, rateText: '', gstRate: 0, hsnCode: '', batchNo: '', mfgDate: '', expiryDate: '' }]);

  useEffect(() => {
    if (visible) {
      if (invoiceToEdit) {
        setDate(invoiceToEdit.date ? new Date(invoiceToEdit.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
        setDueDate(invoiceToEdit.dueDate ? new Date(invoiceToEdit.dueDate).toISOString().split('T')[0] : '');
        setPaymentTermsDays('');
        setShowTermsDropdown(false);
        setInvoiceNo(invoiceToEdit.invoiceNo || '');
        setPartyName(invoiceToEdit.customerName || '');
        setPartyAddress(invoiceToEdit.partyAddress || '');
        setShippingAddress(invoiceToEdit.shippingAddress || '');
        setTransport(invoiceToEdit.transport || '');
        setVehicleNo(invoiceToEdit.vehicleNo || '');
        setEwayBillNo(invoiceToEdit.ewayBillNo || '');
        setIrn(invoiceToEdit.irn || '');
        setWarehouseId(invoiceToEdit.warehouseId || '');
        setStatus(invoiceToEdit.status || 'draft');
        setInternalFreightExpense(invoiceToEdit.internalFreightExpense ? invoiceToEdit.internalFreightExpense.toString() : '');
        setCustomerState(invoiceToEdit.stateOfSupply || 'Uttar Pradesh');
        setItems((invoiceToEdit.items || []).map(it => ({
          productId: it.productId,
          name: it.name,
          qty: it.boxes !== undefined ? it.boxes : it.qty,
          boxes: it.boxes !== undefined ? it.boxes : it.qty,
          mrp: it.mrp || it.rate || 0,
          mrpText: (it.mrp || it.rate || 0).toString(),
          discountPercent: it.discountPercent || 0,
          discountText: (it.discountPercent || 0).toString(),
          rate: it.rate,
          rateText: it.rate.toString(),
          packing: it.packing || 1,
          hsnCode: it.hsnCode || '',
          gstRate: it.gstRate || 0,
          batchNo: (it as any).batchNo || '',
          mfgDate: (it as any).mfgDate || '',
          expiryDate: (it as any).expiryDate || ''
        })));
        setOverridePaymentTerms(true);
      } else {
        setDate(new Date().toISOString().split('T')[0]);
        setDueDate('');
        setPaymentTermsDays('');
        setShowTermsDropdown(false);
        setInvoiceNo('');
        setPartyName('');
        setPartyAddress('');
        setShippingAddress('');
        setPartyCity('');
        setWarehouseId('');
        setShowWarehouseDropdown(false);
        setWarehouses([]);
        setWarehouseInventory([]);
        setStatus('draft');
        setItems([{ name: '', qty: 1, boxes: 1, rate: 0, packing: 1, rateText: '', gstRate: 0 }]);
        setShowCustomerDropdown(false);
        setActiveItemDropdownIdx(null);
        setItemSearchText('');
        setCustomerState('Uttar Pradesh');
        setOverridePaymentTerms(false);

      }

      const loadData = async () => {
        try {
          const [p, c, w] = await Promise.all([
            api.getProducts(),
            api.getCustomers(),
            api.getWarehouses()
          ]);
          setProducts(p);
          setCustomers(c);
          setWarehouses(w);
          if (w.length > 0 && !invoiceToEdit) {
            setWarehouseId(w[0]._id);
          }
        } catch (err) {
          console.log('Failed to fetch initial data in Challan modal:', err);
        }
      };
      loadData();
    }
  }, [visible, invoiceToEdit]);

  // When warehouseId changes, load warehouse inventory and reset items
  useEffect(() => {
    if (warehouseId) {
      const loadWarehouseInventory = async () => {
        try {
          const entries = await api.getInventoryEntries(warehouseId, "", true);
          setWarehouseInventory(entries);
        } catch (err) {
          console.log('Failed to fetch warehouse inventory:', err);
        }
      };
      loadWarehouseInventory();
      if (!invoiceToEdit || invoiceToEdit.warehouseId !== warehouseId) {
        setItems([{ name: '', qty: 1, boxes: 1, rate: 0, packing: 1, rateText: '', gstRate: 0 }]);
      }
    } else {
      setWarehouseInventory([]);
    }
  }, [warehouseId]);

  const filteredCustomers = (customerName
    ? customers.filter(c =>
      (c.company || c.name || '').toLowerCase().includes(customerName.toLowerCase()) ||
      (c.contactPerson || '').toLowerCase().includes(customerName.toLowerCase())
    )
    : customers).filter(c => c.gstin && c.gstin.trim() !== '');

  const handleSelectCustomer = (c: Customer) => {
    const finalName = c.company || c.name;
    setPartyName(finalName);
    const hasGstin = !!(c.gstin && c.gstin.trim());

    setCustomerState(c.state || 'Uttar Pradesh');
    // Auto-fill billing address
    const addr = c.billingAddress;
    setPartyAddress(addr ? [addr.street, addr.city, addr.state, addr.pin].filter(Boolean).join(', ') : '');
    const sAddr = c.shippingAddress;
    setShippingAddress(sAddr && !c.shippingSameAsBilling ? [sAddr.street, sAddr.city, sAddr.state, sAddr.pin].filter(Boolean).join(', ') : (addr ? [addr.street, addr.city, addr.state, addr.pin].filter(Boolean).join(', ') : ''));
    setPartyCity(addr ? [addr.city, addr.state].filter(Boolean).join(', ') : (c.state || ''));

    // Auto-calculate Due Date
    if (c.paymentTerms) {
      const match = c.paymentTerms.match(/\d+/);
      if (match) {
        const days = parseInt(match[0], 10);
        setPaymentTermsDays(days.toString());
        const invDate = new Date(date || Date.now());
        invDate.setDate(invDate.getDate() + days);
        setDueDate(invDate.toISOString().split('T')[0]);
      } else if (c.paymentTerms.toLowerCase().includes('receipt')) {
        setPaymentTermsDays('0');
        setDueDate(date || new Date().toISOString().split('T')[0]);
      } else {
        setPaymentTermsDays('');
      }
    } else {
      setPaymentTermsDays('');
    }

    setShowCustomerDropdown(false);
  };

  const handlePaymentTermsChange = (val: string) => {
    setPaymentTermsDays(val);
    if (!val) {
      setDueDate('');
      return;
    }
    const days = parseInt(val, 10);
    const invDate = new Date(date || Date.now());
    invDate.setDate(invDate.getDate() + days);
    setDueDate(invDate.toISOString().split('T')[0]);
  };

  const handleItemNameChange = (idx: number, text: string) => {
    const next = [...items];
    next[idx].name = text;
    setItems(next);
    setItemSearchText(text);
    setActiveItemDropdownIdx(idx);
  };

  const handleItemFocus = (idx: number) => {
    setActiveItemDropdownIdx(idx);
    setItemSearchText(items[idx].name);
  };

  const getInventoryEntryDisplayName = (entry: InventoryEntry) => {
    const product = products.find(p => p._id === entry.productId);
    const name = product ? product.name : entry.productType || 'Unnamed Product';
    const size = entry.size || '';
    if (size && !name.toLowerCase().includes(size.toLowerCase())) {
      return `${name} (${size})`;
    }
    return name;
  };

  const getFilteredInventoryEntries = (search: string) => {
    const s = search ? search.toLowerCase() : '';

    // Combine actual inventory entries with dummy zero-stock entries for unstocked products
    const allDropdownItems: any[] = [...warehouseInventory];

    // Add dummy entries for products that have NO inventory entries at all
    products.forEach(p => {
      const hasEntry = warehouseInventory.some(e => e.productId === p._id);
      if (!hasEntry) {
        allDropdownItems.push({
          _id: p._id,
          productId: p._id,
          productType: p.productType || '',
          size: p.size || '',
          colour: p.colour || '',
          shape: p.shape || '',
          weight: p.weight || '',
          hsnCode: p.hsnCode || '',
          vendorId: '',
          vendorName: '',
          qtyBoxes: 0,
          packing: 1,
          warehouseId: warehouseId,
          warehouseName: ''
        });
      }
    });

    if (!s) return allDropdownItems;

    return allDropdownItems.filter(entry => {
      const displayName = getInventoryEntryDisplayName(entry).toLowerCase();
      const colour = (entry.colour || '').toLowerCase();
      const shape = (entry.shape || '').toLowerCase();
      return displayName.includes(s) || colour.includes(s) || shape.includes(s);
    });
  };

  const handleSelectInventoryEntry = (idx: number, entry: InventoryEntry) => {
    const next = [...items];
    const product = products.find(p => p._id === entry.productId);
    const productMrp = product ? (product.mrp || product.price || 0) : 0;
    const basePrice = product ? (product.price || productMrp) : 0;
    const gst = product ? (product.gstRate || FIRM_DETAILS.defaultGstRate) : FIRM_DETAILS.defaultGstRate;
    const hsn = product ? (product.hsnCode || '') : '';

    // Check target customer default discount
    const targetCustomer = customers.find(c => (c.company || c.name || '').trim().toLowerCase() === customerName.trim().toLowerCase());
    const customerDisc = targetCustomer ? (targetCustomer.discountPercent || 0) : 0;
    const netRate = customerDisc > 0 && productMrp > 0 ? (productMrp * (1 - customerDisc / 100)) : basePrice;

    next[idx] = {
      productId: entry.productId,
      name: getInventoryEntryDisplayName(entry),
      qty: 1,
      boxes: 1,
      mrp: productMrp,
      mrpText: productMrp > 0 ? productMrp.toString() : '',
      discountPercent: customerDisc,
      discountText: customerDisc > 0 ? customerDisc.toString() : '',
      rate: netRate,
      rateText: netRate > 0 ? netRate.toString() : '',
      packing: entry.packing || 1,
      gstRate: gst,
      hsnCode: hsn,
      maxQty: entry.qtyBoxes,
      batchNo: entry.batchNo || '',
      mfgDate: (entry as any).mfgDate || '',
      expiryDate: (entry as any).expiryDate || ''
    };
    setItems(next);
    setActiveItemDropdownIdx(null);
  };

  const handleSave = async () => {
    const validItems = items.filter(it => it.name.trim() !== '' && it.productId);
    if (!customerName.trim() || validItems.length === 0 || !warehouseId) {
      alert('Please fill party name, select a source warehouse, and add at least one product.');
      return;
    }

    // Enforce that customer has a GSTIN
    const selectedCustomer = customers.find(
      c => (c.company || c.name || '').trim().toLowerCase() === customerName.trim().toLowerCase()
    );
    if (!selectedCustomer || !selectedCustomer.gstin || !selectedCustomer.gstin.trim()) {
      alert('Sale invoices can only be created for customers with a valid GSTIN. Create the sale from Sales Workspace and generate the invoice from a posted Sale Challan.');
      return;
    }


    // Strip maxQty before saving
    const finalItems = validItems.map(({ maxQty, ...rest }) => rest);


    try {
      const selectedWarehouse = warehouses.find(w => w._id === warehouseId);
      const targetCust = customers.find(c => (c.company || c.name) === customerName.trim());
      const finalGstin = targetCust?.gstin || '';

      const invoiceData: Partial<Invoice> = {
        date: date ? new Date(date).toISOString() : undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        invoiceNo: invoiceNo.trim() || undefined,
        customerName: customerName.trim() || 'Walk-in Customer',
        partyAddress: partyAddress.trim(),
        shippingAddress: shippingAddress.trim(),
        transport: transport.trim(),
        vehicleNo: vehicleNo.trim(),
        ewayBillNo: ewayBillNo.trim(),
        irn: irn.trim(),
        stateOfSupply: customerState.trim() || 'Uttar Pradesh',
        gstin: finalGstin,
        warehouseId,
        warehouseName: selectedWarehouse ? selectedWarehouse.name : '',
        status,
        items: finalItems as InvoiceItem[],
        mode,
        baseAmount: totalBase,
        totalMrp: totalMrpValue,
        totalDiscount: totalDiscountSaved,
        cgst,
        sgst,
        igst,
        roundOff,
        internalFreightExpense: parseFloat(internalFreightExpense) || 0,
        amount: nettTotal
      };

      if (invoiceToEdit) {
        await api.updateSaleInvoice(invoiceToEdit._id, invoiceData);
      } else {
        alert('Direct Sale Invoice creation is retired. Create the sale from Sales Workspace and invoice the posted Sale Challan.');
        return;
      }
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to create sale invoice');
    }
  };

  const addItemRow = () => setItems([{ name: '', qty: 1, boxes: 1, rate: 0, packing: 1, rateText: '', gstRate: 0, hsnCode: '', batchNo: '', mfgDate: '', expiryDate: '' }, ...items]);
  const removeItemRow = (idx: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== idx));
    }
    if (activeItemDropdownIdx === idx) {
      setActiveItemDropdownIdx(null);
    }
  };

  const stateCheck = (customerState || 'Uttar Pradesh').trim().toLowerCase();
  const isIntraState = stateCheck === 'uttar pradesh' || stateCheck === 'up';

  let totalMrpValue = 0;
  let totalDiscountSaved = 0;
  let totalBase = 0;
  let totalTax = 0;
  items.forEach(it => {
    if (it.name.trim() !== '' && it.productId) {
      const qtyPcs = it.qty * (it.packing || 1);
      const mrpRate = it.mrp || 0;
      const netRate = it.rate || 0;

      const itemMrpTotal = mrpRate > 0 ? (qtyPcs * mrpRate) : (qtyPcs * netRate);
      const itemBase = qtyPcs * netRate;
      const itemDiscount = Math.max(0, itemMrpTotal - itemBase);

      totalMrpValue += itemMrpTotal;
      totalDiscountSaved += itemDiscount;
      totalBase += itemBase;

      const gst = it.gstRate || 0;
      if (mode === 'regular') {
        const itemTax = (itemBase * gst) / 100;
        totalTax += itemTax;
      }
    }
  });

  const cgst = mode === 'regular' && isIntraState ? totalTax / 2 : 0;
  const sgst = mode === 'regular' && isIntraState ? totalTax / 2 : 0;
  const igst = mode === 'regular' && !isIntraState ? totalTax : 0;
  const rawTotal = totalBase + cgst + sgst + igst;
  const nettTotal = Math.round(rawTotal);
  const roundOff = nettTotal - rawTotal;

  // Sale invoices are intentionally derived from posted Sale Challans. Keep
  // the edit modal for legacy corrections, but remove the unsafe standalone
  // create form from the production workflow.
  if (visible && !invoiceToEdit) {
    return (
      <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={26} color={colors.text.primary} /></TouchableOpacity>
            <Text style={styles.modalTitle}>Create Sale Invoice</Text>
            <View style={{ width: 26 }} />
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: 12 }}>
            <Ionicons name="document-text-outline" size={48} color={colors.primary} />
            <Text style={{ ...Typography.h2, color: colors.text.primary, textAlign: 'center' }}>Create from a posted Sale Challan</Text>
            <Text style={{ ...Typography.body, color: colors.text.secondary, textAlign: 'center' }}>
              Stock and billing must stay linked. Prepare and finalize the Sale Challan in Sales Workspace, then convert it to an invoice.
            </Text>
            <TouchableOpacity style={[styles.addBtn, { width: 'auto', height: 44, paddingHorizontal: 16, flexDirection: 'row', gap: 8 }]} onPress={() => { onClose(); router.push('/sales-workspace?tab=challans'); }}>
              <Ionicons name="arrow-forward-circle-outline" size={18} color="#fff" />
              <Text style={{ ...Typography.caption, color: '#fff', fontWeight: '800' }}>Open Sales Workspace</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContainer}>

        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{invoiceToEdit ? 'Edit Sale Invoice' : 'New Sale Invoice'}</Text>
          <TouchableOpacity onPress={handleSave}>
            <Ionicons name="checkmark-circle" size={26} color={colors.success} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg }} keyboardShouldPersistTaps="handled">
          {(showWarehouseDropdown || showCustomerDropdown || showTermsDropdown || activeItemDropdownIdx !== null) && (
            <Pressable
              style={[
                StyleSheet.absoluteFill,
                { zIndex: showWarehouseDropdown ? 1019 : (showCustomerDropdown ? 1009 : (showTermsDropdown ? 1005 : 999)) }
              ]}
              onPress={() => {
                setShowWarehouseDropdown(false);
                setShowCustomerDropdown(false);
                setShowTermsDropdown(false);
                setActiveItemDropdownIdx(null);
              }}
            />
          )}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.formLabel}>Invoice Number</Text>
              <View style={[styles.formInput, { backgroundColor: colors.bg.secondary, borderColor: colors.border }]}>
                <Ionicons name="barcode-outline" size={16} color={colors.text.muted} />
                <TextInput style={[styles.formInputText, { color: colors.text.muted }]} value={invoiceToEdit ? invoiceNo : "Auto-generated on Save"} editable={false} />
              </View>
            </View>

            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.formLabel}>Date</Text>
              <View style={styles.formInput}>
                <Ionicons name="calendar-outline" size={16} color={colors.text.muted} />
                {Platform.OS === 'web' ? React.createElement('input', {
                  type: 'date',
                  value: date,
                  onChange: (e: any) => setDate(e.target.value),
                  style: { ...Typography.body, flex: 1, padding: 8, border: 'none', outline: 'none', backgroundColor: 'transparent', color: colors.text.primary }
                }) : (
                  <TextInput
                    style={styles.formInputText}
                    placeholder="YYYY-MM-DD"
                    value={date}
                    onChangeText={setDate}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Option to override default customer payment terms */}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, marginTop: 4 }}
            onPress={() => setOverridePaymentTerms(!overridePaymentTerms)}
          >
            <Ionicons
              name={overridePaymentTerms ? "checkbox" : "square-outline"}
              size={18}
              color={overridePaymentTerms ? colors.primary : colors.text.muted}
            />
            <Text style={{ ...Typography.bodySm, fontWeight: '600', color: colors.text.secondary }}>
              Override default customer payment terms
            </Text>
          </TouchableOpacity>

          {overridePaymentTerms && (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: -8, marginBottom: 12 }}>
              <View style={[styles.formGroup, { flex: 1, zIndex: 1015 }]}>
                <Text style={styles.formLabel}>Payment Terms</Text>
                <View style={styles.formInput}>
                  <Ionicons name="time-outline" size={16} color={colors.text.muted} />
                  {Platform.OS === 'web' ? React.createElement('select', {
                    value: paymentTermsDays,
                    onChange: (e: any) => handlePaymentTermsChange(e.target.value),
                    style: { ...Typography.body, flex: 1, padding: 8, border: 'none', outline: 'none', backgroundColor: 'transparent', color: colors.text.primary }
                  }, [
                    React.createElement('option', { value: '', key: 'none' }, 'Custom / Select...'),
                    React.createElement('option', { value: '0', key: '0' }, 'Due on Receipt'),
                    React.createElement('option', { value: '15', key: '15' }, '15 Days'),
                    React.createElement('option', { value: '30', key: '30' }, '30 Days'),
                    React.createElement('option', { value: '45', key: '45' }, '45 Days'),
                    React.createElement('option', { value: '60', key: '60' }, '60 Days'),
                    React.createElement('option', { value: '90', key: '90' }, '90 Days')
                  ]) : (
                    <>
                      <TouchableOpacity style={{ flex: 1, height: '100%', justifyContent: 'center' }} onPress={() => setShowTermsDropdown(!showTermsDropdown)}>
                        <Text style={{ ...Typography.body, color: paymentTermsDays ? colors.text.primary : colors.text.muted }}>
                          {paymentTermsDays ? (paymentTermsDays === '0' ? 'Due on Receipt' : `${paymentTermsDays} Days`) : 'Select Terms...'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setShowTermsDropdown(!showTermsDropdown)}>
                        <Ionicons name={showTermsDropdown ? "chevron-up" : "chevron-down"} size={16} color={colors.text.muted} />
                      </TouchableOpacity>
                    </>
                  )}
                </View>

                {showTermsDropdown && Platform.OS !== 'web' && (
                  <View style={[styles.customSelectPanel, { top: 75 }]}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                      {[
                        { val: '', label: 'Custom / Select...' },
                        { val: '0', label: 'Due on Receipt' },
                        { val: '15', label: '15 Days' },
                        { val: '30', label: '30 Days' },
                        { val: '45', label: '45 Days' },
                        { val: '60', label: '60 Days' },
                        { val: '90', label: '90 Days' },
                      ].map(t => (
                        <TouchableOpacity
                          key={t.val}
                          style={styles.customSelectItem}
                          onPress={() => {
                            handlePaymentTermsChange(t.val);
                            setShowTermsDropdown(false);
                          }}
                        >
                          <Text style={styles.customSelectItemText}>{t.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.formLabel}>Calculated Due Date</Text>
                <View style={[styles.formInput, { backgroundColor: colors.bg.secondary, borderColor: colors.border }]}>
                  <Ionicons name="calendar" size={16} color={colors.text.muted} />
                  <TextInput style={[styles.formInputText, { color: colors.text.muted }]} value={dueDate} editable={false} placeholder="Select terms..." />
                </View>
              </View>
            </View>
          )}

          {/* Source Warehouse Selection */}
          <View style={[styles.formGroup, { zIndex: 1020 }]}>
            <Text style={styles.formLabel}>Source Warehouse *</Text>
            <View style={styles.customSearchSelectContainer}>
              <TouchableOpacity
                style={styles.formInput}
                onPress={() => setShowWarehouseDropdown(!showWarehouseDropdown)}
              >
                <Ionicons name="business-outline" size={16} color={colors.text.muted} />
                <Text style={[styles.formInputText, { paddingVertical: 12, lineHeight: 20 }]}>
                  {warehouses.find(w => w._id === warehouseId)?.name || 'Select Source Warehouse...'}
                </Text>
                <Ionicons name={showWarehouseDropdown ? "chevron-up" : "chevron-down"} size={16} color={colors.text.muted} />
              </TouchableOpacity>

              {showWarehouseDropdown && (
                <View style={styles.customSelectPanel}>
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                    {warehouses.map(w => (
                      <TouchableOpacity
                        key={w._id}
                        style={styles.customSelectItem}
                        onPress={() => {
                          setWarehouseId(w._id);
                          setShowWarehouseDropdown(false);
                        }}
                      >
                        <Text style={styles.customSelectItemText}>{w.name}</Text>
                        <Text style={styles.customSelectItemSubtext}>{w.city}, {w.state}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>


          {/* Party Name Customer Search Input Selector */}
          <View style={[styles.formGroup, { zIndex: 1010 }]}>
            <Text style={styles.formLabel}>Party Name (Customer) *</Text>
            <View style={styles.customSearchSelectContainer}>
              <View style={styles.formInput}>
                <Ionicons name="person-outline" size={16} color={colors.text.muted} />
                <TextInput
                  style={styles.formInputText}
                  placeholder="Search and select customer..."
                  placeholderTextColor={colors.text.muted}
                  value={customerName}
                  onChangeText={(val) => {
                    setPartyName(val);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                />
                {customerName ? (
                  <TouchableOpacity onPress={() => { setPartyName(''); setShowCustomerDropdown(true); }}>
                    <Ionicons name="close-circle" size={18} color={colors.text.muted} style={{ paddingLeft: 6 }} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {showCustomerDropdown && (
              <View style={styles.customSelectPanel}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                  {filteredCustomers.map(c => {
                    const cName = c.company || c.name;
                    return (
                      <TouchableOpacity
                        key={c._id}
                        style={styles.customSelectItem}
                        onPress={() => handleSelectCustomer(c)}
                      >
                        <Text style={styles.customSelectItemText}>{cName}</Text>
                        <Text style={styles.customSelectItemSubtext}>
                          {c.gstin ? `GSTIN: ${c.gstin}` : 'Cash / Unregistered'}
                          {c.phone ? ` | Phone: ${c.phone}` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {filteredCustomers.length === 0 && (
                    <View style={{ padding: 12 }}>
                      <Text style={{ ...Typography.bodySm, color: colors.text.muted, textAlign: 'center' }}>
                        No customers found (typing custom name)
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={[styles.customSelectItem, { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg.secondary }]}
                    onPress={() => setShowCustomerDropdown(false)}
                  >
                    <Text style={[styles.customSelectItemText, { color: colors.primary, textAlign: 'center' }]}>
                       Use typed custom name
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            )}
          </View>

          {/* Billing Address Input */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Billing Address (Party Address)</Text>
            <View style={styles.formInput}>
              <Ionicons name="location-outline" size={16} color={colors.text.muted} />
              <TextInput
                style={styles.formInputText}
                placeholder="Enter billing address..."
                placeholderTextColor={colors.text.muted}
                value={partyAddress}
                onChangeText={setPartyAddress}
                multiline
              />
            </View>
          </View>

          {/* Shipping Address Input */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Shipping Address</Text>
            <View style={styles.formInput}>
              <Ionicons name="bus-outline" size={16} color={colors.text.muted} />
              <TextInput
                style={styles.formInputText}
                placeholder="Enter shipping address..."
                placeholderTextColor={colors.text.muted}
                value={shippingAddress}
                onChangeText={setShippingAddress}
                multiline
              />
            </View>
          </View>

          {/* Transport Details Row */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.formLabel}>Transport</Text>
              <View style={styles.formInput}>
                <Ionicons name="bus-outline" size={16} color={colors.text.muted} />
                <TextInput style={styles.formInputText} placeholder="Transport name..." placeholderTextColor={colors.text.muted} value={transport} onChangeText={setTransport} />
              </View>
            </View>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.formLabel}>Vehicle No.</Text>
              <View style={styles.formInput}>
                <Ionicons name="car-outline" size={16} color={colors.text.muted} />
                <TextInput style={styles.formInputText} placeholder="UP65..." placeholderTextColor={colors.text.muted} value={vehicleNo} onChangeText={setVehicleNo} />
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.formLabel}>E-Way Bill No.</Text>
              <View style={styles.formInput}>
                <Ionicons name="document-text-outline" size={16} color={colors.text.muted} />
                <TextInput style={styles.formInputText} placeholder="E-Way Bill..." placeholderTextColor={colors.text.muted} value={ewayBillNo} onChangeText={setEwayBillNo} keyboardType="numeric" />
              </View>
            </View>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.formLabel}>IRN</Text>
              <View style={styles.formInput}>
                <Ionicons name="qr-code-outline" size={16} color={colors.text.muted} />
                <TextInput style={styles.formInputText} placeholder="IRN..." placeholderTextColor={colors.text.muted} value={irn} onChangeText={setIrn} />
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.formLabel}>Internal Freight Exp.</Text>
              <View style={styles.formInput}>
                <Ionicons name="cube" size={16} color={colors.text.muted} />
                <TextInput style={styles.formInputText} placeholder="Paid by Us..." placeholderTextColor={colors.text.muted} value={internalFreightExpense} onChangeText={setInternalFreightExpense} keyboardType="numeric" />
              </View>
            </View>
            <View style={[styles.formGroup, { flex: 1 }]} />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 8 }}>
            <Text style={styles.sectionTitle}>Invoice Items</Text>
            <TouchableOpacity style={styles.addItemRowBtn} onPress={addItemRow}>
              <Ionicons name="add" size={14} color={colors.primary} />
              <Text style={{ ...Typography.bodySm, color: colors.primary, fontWeight: '700' }}>Add Item</Text>
            </TouchableOpacity>
          </View>

          {items.map((it, idx) => {
            const subtotal = it.qty * (it.rate || 0) * (it.packing || 1);
            const isDropdownOpen = activeItemDropdownIdx === idx;
            const filtered = getFilteredInventoryEntries(isDropdownOpen ? itemSearchText : '');

            // Check stock limits
            const matchedEntry = warehouseInventory.find(e =>
              e.productId === it.productId &&
              (e.packing || 1) === (it.packing || 1)
            );
            const maxQty = matchedEntry ? matchedEntry.qtyBoxes : 0;
            const hasError = !!(it.productId && it.qty > maxQty);

            return (
              <View key={idx} style={[styles.itemCardForm, { zIndex: isDropdownOpen ? 1000 : 100 - idx, position: 'relative' }]}>
                {/* Row Header/Top line: Product Selection */}
                <View style={{ position: 'relative', zIndex: isDropdownOpen ? 10 : 1 }}>
                  <Text style={styles.itemSublabel}>Select Product (From Warehouse Stock) *</Text>
                  <View style={styles.formInput}>
                    <Ionicons name="cube-outline" size={14} color={colors.text.muted} />
                    <TextInput
                      style={styles.formInputText}
                      placeholder="Type to search product stock..."
                      placeholderTextColor={colors.text.muted}
                      value={it.name}
                      onChangeText={(v) => handleItemNameChange(idx, v)}
                      onFocus={() => handleItemFocus(idx)}
                    />
                    {it.name ? (
                      <TouchableOpacity onPress={() => {
                        const next = [...items];
                        next[idx] = { name: '', qty: 1, boxes: 1, rate: 0, packing: 1, rateText: '', gstRate: 0 };
                        setItems(next);
                        setItemSearchText('');
                        setActiveItemDropdownIdx(idx);
                      }}>
                        <Ionicons name="close-circle" size={16} color={colors.text.muted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {isDropdownOpen && (
                    <View style={styles.customSelectPanel}>
                      <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                        {filtered.map(entry => (
                          <TouchableOpacity
                            key={entry._id}
                            style={styles.customSelectItem}
                            onPress={() => handleSelectInventoryEntry(idx, entry)}
                          >
                            <Text style={styles.customSelectItemText}>{getInventoryEntryDisplayName(entry)}</Text>
                            <Text style={styles.customSelectItemSubtext}>
                              Packing: {entry.packing} | Vendor: {entry.vendorName} | Available: {entry.qtyBoxes} boxes
                            </Text>
                          </TouchableOpacity>
                        ))}
                        {filtered.length === 0 && (
                          <View style={{ padding: 12 }}>
                            <Text style={{ ...Typography.bodySm, color: colors.text.muted, textAlign: 'center' }}>No available stock entries in this warehouse</Text>
                          </View>
                        )}
                        <TouchableOpacity
                          style={[styles.customSelectItem, { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg.secondary }]}
                          onPress={() => setActiveItemDropdownIdx(null)}
                        >
                          <Text style={[styles.customSelectItemText, { color: colors.primary, textAlign: 'center' }]}>
                             Close list
                          </Text>
                        </TouchableOpacity>
                      </ScrollView>
                    </View>
                  )}
                </View>

                {/* Bottom line: Qty, MRP, Disc %, Net Rate, Subtotal, Remove */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 70 }}>
                    <Text style={styles.itemSublabel}>Boxes</Text>
                    <TextInput
                      style={[styles.itemInput, hasError && { borderColor: colors.danger, borderWidth: 1 }]}
                      placeholder="Qty"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="numeric"
                      value={it.qty.toString()}
                      onChangeText={(v) => {
                        const next = [...items];
                        const val = parseInt(v) || 0;
                        next[idx].qty = val;
                        next[idx].boxes = val;
                        setItems(next);
                      }}
                    />
                  </View>

                  <View style={{ flex: 1.2, minWidth: 80 }}>
                    <Text style={styles.itemSublabel}>MRP (₹)</Text>
                    <TextInput
                      style={styles.itemInput}
                      placeholder="0.00"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="numeric"
                      value={it.mrpText !== undefined ? it.mrpText : (it.mrp || 0).toString()}
                      onChangeText={(v) => {
                        const next = [...items];
                        const mrpVal = parseFloat(v) || 0;
                        next[idx].mrpText = v;
                        next[idx].mrp = mrpVal;
                        const disc = next[idx].discountPercent || 0;
                        const computedRate = mrpVal > 0 ? (disc > 0 ? mrpVal * (1 - disc / 100) : mrpVal) : (next[idx].rate || 0);
                        next[idx].rate = computedRate;
                        next[idx].rateText = computedRate > 0 ? computedRate.toString() : '';
                        setItems(next);
                      }}
                    />
                  </View>

                  <View style={{ flex: 1, minWidth: 70 }}>
                    <Text style={styles.itemSublabel}>Disc (%)</Text>
                    <TextInput
                      style={styles.itemInput}
                      placeholder="0%"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="numeric"
                      value={it.discountText !== undefined ? it.discountText : (it.discountPercent || 0).toString()}
                      onChangeText={(v) => {
                        const next = [...items];
                        const discVal = parseFloat(v) || 0;
                        next[idx].discountText = v;
                        next[idx].discountPercent = discVal;
                        const mrpVal = next[idx].mrp || next[idx].rate || 0;
                        const computedRate = mrpVal > 0 ? mrpVal * (1 - discVal / 100) : (next[idx].rate || 0);
                        next[idx].rate = computedRate;
                        next[idx].rateText = computedRate > 0 ? computedRate.toString() : '';
                        setItems(next);
                      }}
                    />
                  </View>

                  <View style={{ flex: 1.2, minWidth: 80 }}>
                    <Text style={styles.itemSublabel}>Net Rate (₹)</Text>
                    <TextInput
                      style={styles.itemInput}
                      placeholder="Rate"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="numeric"
                      value={it.rateText !== undefined ? it.rateText : (it.rate || 0).toString()}
                      onChangeText={(v) => {
                        const next = [...items];
                        const netRate = parseFloat(v) || 0;
                        next[idx].rateText = v;
                        next[idx].rate = netRate;
                        const mrpVal = next[idx].mrp || 0;
                        if (mrpVal > 0 && mrpVal >= netRate) {
                          const computedDisc = ((mrpVal - netRate) / mrpVal) * 100;
                          next[idx].discountPercent = parseFloat(computedDisc.toFixed(1));
                          next[idx].discountText = computedDisc > 0 ? computedDisc.toFixed(1) : '';
                        }
                        setItems(next);
                      }}
                    />
                  </View>

                  <View style={{ flex: 1.5, minWidth: 90, alignItems: 'flex-end', justifyContent: 'center', minHeight: 40, marginTop: 12 }}>
                    <Text style={{ ...Typography.eyebrow, color: colors.text.muted, fontWeight: '600' }}>Amount</Text>
                    <Text style={{ ...Typography.bodySm, color: colors.success, fontWeight: '800' }}>
                      ₹{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>

                  {items.length > 1 && (
                    <TouchableOpacity style={[styles.itemRemoveBtn, { marginTop: 14 }]} onPress={() => removeItemRow(idx)}>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>

                {it.productId ? (
                  <View style={{ marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ ...Typography.eyebrow, color: hasError ? colors.danger : colors.text.muted, fontWeight: '600' }}>
                        {hasError ? ` Exceeds stock: ${maxQty} boxes` : `Stock: ${maxQty} boxes (Pack: ${it.packing || 1})`}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Ionicons name="pricetag-outline" size={11} color={colors.text.muted} />
                          <TextInput
                            style={{ ...Typography.eyebrow, fontWeight: '600', color: colors.text.secondary, borderBottomWidth: 1, borderBottomColor: colors.border, minWidth: 55, paddingVertical: 1, paddingHorizontal: 2 }}
                            placeholder="HSN"
                            placeholderTextColor={colors.text.muted}
                            value={it.hsnCode || ''}
                            onChangeText={(v) => {
                              const next = [...items];
                              next[idx].hsnCode = v;
                              setItems(next);
                            }}
                          />
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Ionicons name="barcode-outline" size={11} color={colors.primary} />
                          <TextInput
                            style={{ ...Typography.eyebrow, fontWeight: '700', color: colors.primary, borderBottomWidth: 1, borderBottomColor: colors.primary + '50', minWidth: 65, paddingVertical: 1, paddingHorizontal: 2 }}
                            placeholder="Batch"
                            placeholderTextColor={colors.text.muted}
                            value={it.batchNo || ''}
                            onChangeText={(v) => {
                              const next = [...items];
                              next[idx].batchNo = v;
                              setItems(next);
                            }}
                          />
                        </View>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 4, alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="calendar-outline" size={11} color={colors.text.muted} />
                        <TextInput
                          style={{ ...Typography.eyebrow, color: colors.text.secondary, borderBottomWidth: 1, borderBottomColor: colors.border, minWidth: 85, paddingVertical: 1, paddingHorizontal: 2 }}
                          placeholder="MFG (YYYY-MM-DD)"
                          placeholderTextColor={colors.text.muted}
                          value={it.mfgDate || ''}
                          onChangeText={(v) => {
                            const next = [...items];
                            next[idx].mfgDate = v;
                            setItems(next);
                          }}
                        />
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="calendar-outline" size={11} color={colors.danger} />
                        <TextInput
                          style={{ ...Typography.eyebrow, color: colors.danger, borderBottomWidth: 1, borderBottomColor: colors.danger + '50', minWidth: 85, paddingVertical: 1, paddingHorizontal: 2 }}
                          placeholder="Expiry (YYYY-MM-DD)"
                          placeholderTextColor={colors.text.muted}
                          value={it.expiryDate || ''}
                          onChangeText={(v) => {
                            const next = [...items];
                            next[idx].expiryDate = v;
                            setItems(next);
                          }}
                        />
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}

          {mode === 'regular' ? (
            <View style={[styles.grandTotalContainer, { flexDirection: 'column', alignItems: 'stretch', gap: 6 }]}>
              {totalMrpValue > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={[styles.grandTotalLabel, { ...Typography.bodySm, fontWeight: '500', color: colors.text.muted }]}>Total Item MRP:</Text>
                  <Text style={[styles.grandTotalValue, { ...Typography.bodySm, fontWeight: '600', color: colors.text.secondary }]}>
                    ₹{totalMrpValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              )}

              {totalDiscountSaved > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <Text style={[styles.grandTotalLabel, { ...Typography.bodySm, fontWeight: '600', color: colors.success }]}>Total Discount Saved:</Text>
                  <View style={{ backgroundColor: colors.success + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm }}>
                    <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.success }}>
                      - ₹{totalDiscountSaved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>
              )}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={[styles.grandTotalLabel, { ...Typography.bodySm, fontWeight: '600', color: colors.text.secondary }]}>Taxable Base Amount:</Text>
                <Text style={[styles.grandTotalValue, { ...Typography.bodySm, fontWeight: '600', color: colors.text.secondary }]}>₹{totalBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              </View>
              {isIntraState ? (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={[styles.grandTotalLabel, { ...Typography.bodySm, fontWeight: '500', color: colors.text.muted }]}>CGST:</Text>
                    <Text style={[styles.grandTotalValue, { ...Typography.bodySm, fontWeight: '500', color: colors.text.muted }]}>₹{cgst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={[styles.grandTotalLabel, { ...Typography.bodySm, fontWeight: '500', color: colors.text.muted }]}>SGST:</Text>
                    <Text style={[styles.grandTotalValue, { ...Typography.bodySm, fontWeight: '500', color: colors.text.muted }]}>₹{sgst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={[styles.grandTotalLabel, { ...Typography.bodySm, fontWeight: '500', color: colors.text.muted }]}>IGST:</Text>
                  <Text style={[styles.grandTotalValue, { ...Typography.bodySm, fontWeight: '500', color: colors.text.muted }]}>₹{igst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                </View>
              )}
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.grandTotalLabel}>Nett Total:</Text>
                <Text style={styles.grandTotalValue}>₹{nettTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.grandTotalContainer}>
              <Text style={styles.grandTotalLabel}>Grand Total:</Text>
              <Text style={styles.grandTotalValue}>₹{totalBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const getOverdueText = (item: Invoice, customers: Customer[], colors: any) => {
  if (item.status === 'Cancelled') return { text: '-', color: colors.text.muted };
  if (!item.isFinalized) return { text: 'Draft', color: colors.text.muted };
  if (item.status?.toLowerCase() === 'paid') return { text: 'Paid', color: colors.success };

  let dueDate: Date;

  if (item.dueDate) {
    dueDate = new Date(item.dueDate);
  } else {
    const customer = customers.find(c => (c.company || c.name) === item.customerName);
    const termsStr = customer?.paymentTerms || 'Net 30';
    const match = termsStr.match(/\d+/);
    const termDays = match ? parseInt(match[0]) : 30;

    const invoiceDate = new Date(item.date);
    dueDate = new Date(invoiceDate.getTime() + termDays * 24 * 60 * 60 * 1000);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - dueDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays > 0) {
    return { text: `Overdue by ${diffDays} day${diffDays > 1 ? 's' : ''}`, color: colors.danger };
  } else if (diffDays === 0) {
    return { text: 'Due Today', color: colors.warning };
  } else {
    const remainingDays = Math.abs(diffDays);
    return { text: `Due in ${remainingDays} day${remainingDays > 1 ? 's' : ''}`, color: colors.text.secondary };
  }
};

export default function SaleInvoicesScreen() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useListState('sales_search', '');
  
  const params = useLocalSearchParams<{ search?: string }>();
  useEffect(() => {
    if (params.search && params.search !== search) {
      setSearch(params.search);
    }
  }, [params.search]);

  const debouncedSearch = useDebouncedValue(search, 300);
  const [fyFilter, setFyFilter] = useListState('sales_fyFilter', 'All');
  const [refreshing, setRefreshing] = useState(false);
  // Initial-load flag so DataTable shows its skeleton instead of an empty table.
  const [loading, setLoading] = useState(true);
  const [selectedInv, setSelectedInv] = useState<Invoice | null>(null);
  const [invoiceToEdit, setInvoiceToEdit] = useState<Invoice | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Pagination states
  const [page, setPage] = useListState('sales_page', 1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 50;

  const { colors } = useTheme();
  const { user } = useAuth();
  const perm = usePermission();
  const styles = useStyles(createStyles);
  const canAccessCash = user?.canAccessCash ?? false;

  const modeFilter = 'regular';

  const load = useCallback(async () => {
    const [resInvoices, resCustomers] = await Promise.all([
      api.getSaleInvoices(debouncedSearch, modeFilter, page, limit),
      api.getCustomers()
    ]);
    if (resInvoices && resInvoices.data) {
      if (page === 1) {
        setInvoices(resInvoices.data);
      } else {
        setInvoices(prev => {
          // Prevent duplicates by checking IDs
          const existingIds = new Set(prev.map(inv => inv._id));
          const newInvoices = resInvoices.data.filter((inv: any) => !existingIds.has(inv._id));
          return [...prev, ...newInvoices];
        });
      }
      setTotalPages(resInvoices.totalPages || 1);
    } else {
      setInvoices(Array.isArray(resInvoices) ? resInvoices : []);
      setTotalPages(1);
    }
    if (page === 1) {
      setCustomers(resCustomers);
    }
    setLoading(false);
  }, [debouncedSearch, modeFilter, page]);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('invoice_updated_event', () => { load(); });
    return () => sub.remove();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    api.clearCache();
    await load();
    setRefreshing(false);
  }, [load]);

  const availableFYs = ['All', ...Array.from(new Set(invoices.map(inv => getFinancialYearString(new Date(inv.date))))).sort().reverse()];

  const filteredInvoices = invoices.filter(inv => {
    if (fyFilter !== 'All') {
      const invFy = getFinancialYearString(new Date(inv.date));
      if (invFy !== fyFilter) return false;
    }
    return true;
  });

  const columns: Column<Invoice>[] = [
    {
      key: 'invoiceNo',
      title: 'Invoice No',
      width: 160,
      render: (item) => (
        <Text style={[styles.tableCell, { fontWeight: '700' }]} numberOfLines={1}>{item.invoiceNo}</Text>
      )
    },
    {
      key: 'customerName',
      title: 'Customer Name',
      flex: 2,
      width: 200,
      render: (item) => (
        <Text style={styles.tableCell} numberOfLines={1}>{item.customerName || 'N/A'}</Text>
      )
    },
    {
      key: 'date',
      title: 'Date',
      width: 120,
      hideOnMobile: true,
      render: (item) => (
        <Text style={styles.tableCell}>{new Date(item.date).toLocaleDateString('en-IN')}</Text>
      )
    },
    {
      key: 'amount',
      title: 'Amount',
      width: 120,
      render: (item) => (
        <Text style={[styles.tableCell, { fontWeight: '800' }]}>₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
      )
    },
    {
      key: 'status',
      title: 'Doc Status',
      width: 120,
      hideOnMobile: true,
      render: (item) => (
        <StatusPill  label={<>{item.status === 'Cancelled' ? 'CANCELLED' : (item.isFinalized ? 'FINALIZED' : 'DRAFT')}</>} textStyle={[styles.statusText, {
            color: item.status === 'Cancelled' ? colors.danger : (item.isFinalized ? colors.success : colors.warning)
          }]} />
      )
    },
    {
      key: 'overdue',
      title: 'Overdue Status',
      width: 130,
      hideOnMobile: true,
      render: (item) => {
        const overdueInfo = getOverdueText(item, customers, colors);
        return (
          <Text style={{ ...Typography.bodySm, fontWeight: '600', color: overdueInfo.color }}>
            {overdueInfo.text}
          </Text>
        );
      }
    },
    {
      key: 'actions',
      title: 'Actions',
      width: 160,
      align: 'center',
      render: (item) => (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: colors.primary,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6
            }}
            onPress={(e) => { e.stopPropagation?.(); printInvoice(item); }}
          >
            <Ionicons name="print-outline" size={13} color="#fff" />
            <Text style={{ ...Typography.bodySm, color: '#fff', fontWeight: 'bold' }}>Print</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: '#25D366',
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6
            }}
            onPress={(e) => { e.stopPropagation?.(); shareInvoiceOnWhatsApp(item, customers); }}
          >
            <Ionicons name="logo-whatsapp" size={13} color="#fff" />
            <Text style={{ ...Typography.bodySm, color: '#fff', fontWeight: 'bold' }}>Share</Text>
          </TouchableOpacity>
        </View>
      )
    }
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.innerContainer}>
        <View style={{ zIndex: 1100, position: 'relative' }}>
          {showFilterDropdown && (
            <Pressable
              style={[
                StyleSheet.absoluteFill,
                {
                  zIndex: 900,
                  ...(Platform.OS === 'web' ? { position: 'fixed' as any } : {})
                }
              ]}
              onPress={() => setShowFilterDropdown(false)}
            />
          )}
          <ListToolbar
            searchValue={search}
            onSearchChange={setSearch}
            itemCount={filteredInvoices ? filteredInvoices.length : 0}
            totalCount={invoices ? invoices.length : 0}
            searchPlaceholder="Search sale invoices..."
            primaryAction={{
              label: 'From Challan',
              icon: 'document-text-outline',
              onPress: () => router.push('/sales-workspace?tab=challans')
            }}
            renderFilters={() => (
              <View style={{ position: 'relative', zIndex: showFilterDropdown ? 1000 : 1 }}>
                <TouchableOpacity
                  style={styles.filterDropdownButton}
                  onPress={() => setShowFilterDropdown(!showFilterDropdown)}
                >
                  <Text style={styles.filterDropdownButtonText}>
                    {fyFilter === 'All' ? 'All FYs' : `FY ${fyFilter}`}
                  </Text>
                  <Ionicons name={showFilterDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.muted} />
                </TouchableOpacity>

                {showFilterDropdown && (
                  <View style={[styles.filterDropdownPanel, { top: 40, right: 0 }]}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
                      {availableFYs.map(fy => (
                        <TouchableOpacity
                          key={fy}
                          style={[styles.filterDropdownItem, fyFilter === fy && styles.filterDropdownItemActive]}
                          onPress={() => {
                            setFyFilter(fy);
                            setShowFilterDropdown(false);
                          }}
                        >
                          <Text style={[styles.filterDropdownItemText, fyFilter === fy && { fontWeight: '700', color: colors.primary }]}>
                            {fy === 'All' ? 'All Financial Years' : `FY ${fy}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}
          />
        </View>

        <View style={{ flex: 1, marginHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
          <DataTable
            data={filteredInvoices}
            columns={columns}
            keyExtractor={item => item._id}
            isLoading={loading}
            isRefreshing={refreshing}
            onRefresh={onRefresh}
            onLoadMore={() => {
              if (page < totalPages) setPage(p => p + 1);
            }}
            isLoadingMore={page < totalPages}
            onRowPress={(item) => { setSelectedInv(item); setDetailVisible(true); }}
            ListEmptyComponent={
              <EmptyState 
                title={search ? <>No invoices found for "{search}"</> : <>No sales invoices found</>} 
                message={!search ? <>Record your first sale invoice to start tracking revenue.</> : undefined}
                actionLabel={!search ? 'New Sale Invoice' : 'Clear Search'}
                onAction={!search ? () => setAddVisible(true) : () => setSearch('')}
              />
            }
          />
        </View>
      </View>

      <InvoiceDetailModal
        invoice={selectedInv}
        visible={detailVisible}
        onClose={() => { setDetailVisible(false); load(); }}
        onDeleted={load}
        onEdit={(inv) => {
          setInvoiceToEdit(inv);
          setAddVisible(true);
        }}
      />
      <AddInvoiceModal
        visible={addVisible}
        onClose={() => {
          setAddVisible(false);
          setInvoiceToEdit(null);
        }}
        onSaved={() => {
          load();
          setDetailVisible(false);
        }}
        invoiceToEdit={invoiceToEdit}
      />
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  innerContainer: { flex: 1, width: '100%' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.card, marginHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.xs, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, gap: 10, minHeight: 46 },
  searchInput: { borderWidth: 0, backgroundColor: 'transparent', ...Typography.bodySm, flex: 1, height: 42, color: colors.text.primary },
  addBtn: { width: 34, height: 34, borderRadius: Radius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },

  filterDropdownButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, height: 34, gap: 6 },
  filterDropdownButtonText: { ...Typography.bodySm, fontWeight: '700', color: colors.text.secondary },
  filterDropdownPanel: { position: 'absolute', backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, width: 200, zIndex: 9999, ...Shadows.floating },
  filterDropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterDropdownItemActive: { backgroundColor: colors.primary + '08' },
  filterDropdownItemText: { ...Typography.bodySm, color: colors.text.primary },

  emptyText: { ...Typography.bodySm, color: colors.text.muted, textAlign: 'center', marginTop: 40 },

  table: { flex: 1, width: '100%', minWidth: 950, backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, marginVertical: Spacing.md, overflow: 'hidden' },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  tableHeaderCell: { ...Typography.caption, fontWeight: '800', color: colors.text.muted },
  tableHeaderCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  tableBodyRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  tableCell: { ...Typography.bodySm, color: colors.text.primary },
  tableCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  primaryText: { ...Typography.bodySm, fontWeight: '700', color: colors.text.primary },
  secondaryText: { ...Typography.eyebrow, color: colors.text.muted, marginTop: 1 },
  outstandingText: { ...Typography.bodySm, fontWeight: '800' },
  actionIconButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  emptyTableContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, alignSelf: 'flex-start' },
  statusText: { ...Typography.eyebrow, fontWeight: '800' },

  modalContainer: { flex: 1, backgroundColor: colors.bg.primary, width: '100%', maxWidth: 650, alignSelf: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  modalTitle: { ...Typography.h2, fontWeight: '800', color: colors.text.primary },
  profileHeader: { alignItems: 'center', marginBottom: 20, marginTop: 10 },
  profileAvatar: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  profileName: { ...Typography.h1, fontWeight: '800', color: colors.text.primary },
  profileCustomer: { ...Typography.body, color: colors.text.secondary },
  infoGrid: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.lg, gap: 16 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { ...Typography.caption, color: colors.text.muted, fontWeight: '600' },
  infoValue: { ...Typography.body, color: colors.text.primary, fontWeight: '500' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.danger, borderRadius: Radius.md, paddingVertical: 12, marginTop: 24, marginBottom: 16 },
  deleteBtnText: { ...Typography.body, color: '#fff', fontWeight: '700' },

  formGroup: { marginBottom: 16 },
  formLabel: { ...Typography.bodySm, fontWeight: '700', color: colors.text.secondary, marginBottom: 6 },
  formInput: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 },
  formInputText: { borderWidth: 0, backgroundColor: 'transparent', ...Typography.body, flex: 1, height: 46, color: colors.text.primary },
  statusSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  statusBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.card },
  statusBtnText: { ...Typography.caption, fontWeight: '700', color: colors.text.secondary },

  modeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start' },
  modeText: { ...Typography.eyebrow, fontWeight: '800' },
  modeSelector: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 16 },
  modeBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.card },
  modeBtnText: { ...Typography.bodySm, fontWeight: '700', color: colors.text.secondary },



  gstCalculationPreview: { marginTop: 16, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.secondary },
  previewTitle: { ...Typography.bodySm, fontWeight: '700', color: colors.text.primary, marginBottom: 8 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  previewLabel: { ...Typography.bodySm, color: colors.text.secondary },
  previewValue: { ...Typography.bodySm, fontWeight: '600', color: colors.text.primary },
  previewDivider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },

  // Missing from earlier migration
  customSearchSelectContainer: { position: 'relative', width: '100%' },
  customSelectPanel: { position: 'absolute', top: 50, left: 0, right: 0, backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, zIndex: 2000, boxShadow: '0px 2px 4px rgba(0,0,0,0.1)', elevation: 4 },
  customSelectItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  customSelectItemText: { ...Typography.bodySm, fontWeight: '700', color: colors.text.primary },
  customSelectItemSubtext: { ...Typography.eyebrow, color: colors.text.muted, marginTop: 2 },
  itemCardForm: { backgroundColor: colors.bg.secondary, padding: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  itemSublabel: { ...Typography.eyebrow, fontWeight: '700', color: colors.text.secondary, marginBottom: 4 },
  grandTotalContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg.secondary, padding: 14, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, marginVertical: 12 },
  grandTotalLabel: { ...Typography.body, fontWeight: '800', color: colors.text.primary },
  grandTotalValue: { ...Typography.h3, fontWeight: '800', color: colors.success },
  itemRowDetail: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, alignItems: 'center' },
  itemSubTextDetail: { ...Typography.caption, color: colors.text.muted, marginTop: 2 },

  sectionTitle: { ...Typography.body, fontWeight: '700', color: colors.text.primary, marginBottom: 8 },
  itemsCard: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: Spacing.lg },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  itemRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  itemNameText: { ...Typography.bodySm, color: colors.text.primary, fontWeight: '500' },
  itemQtyText: { ...Typography.bodySm, color: colors.primary, fontWeight: '700' },
  printBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2563eb', borderRadius: Radius.md, paddingVertical: 13, marginTop: 24, marginBottom: 8 },
  printBtnText: { ...Typography.body, color: '#fff', fontWeight: '700' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: colors.primary + '40', backgroundColor: colors.primary + '10' },
  actionBtnText: { ...Typography.caption, fontWeight: '700' },
  addItemRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.primary + '30', backgroundColor: colors.primary + '08' },
  itemInput: { ...Typography.bodySm, backgroundColor: colors.bg.card, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 40, color: colors.text.primary },
  itemRemoveBtn: { width: 40, height: 40, borderRadius: 6, borderWidth: 1, borderColor: colors.danger + '30', backgroundColor: colors.danger + '08', alignItems: 'center', justifyContent: 'center' }
});
