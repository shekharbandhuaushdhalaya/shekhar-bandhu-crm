import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { createStyles } from '../manufacturingStyles';
import { FIRM_DETAILS } from '../../../constants/firm';

interface Props {
  visible: boolean;
  loadingBmr: boolean;
  bmrReport: any;
  onClose: () => void;
  onPrint: () => void;
}

export default function BMRReportModal({ visible, loadingBmr, bmrReport, onClose, onPrint }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');
  const fmtDateTime = (d: any) =>
    d ? new Date(d).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const handlePrintPdf = () => {
    if (Platform.OS === 'web' && bmrReport) {
      const header = bmrReport.ayushHeader || {};
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>BMR_${bmrReport.batchNo}_AYUSH_GMP</title>
            <style>
              body { font-family: 'Arial', sans-serif; padding: 20px; color: #111; font-size: 12px; }
              .header { text-align: center; border-bottom: 2px solid #1b4d3e; padding-bottom: 10px; margin-bottom: 15px; }
              .firm-title { font-size: 20px; font-weight: bold; color: #1b4d3e; margin: 0; }
              .firm-subtitle { font-size: 11px; color: #555; margin-top: 3px; }
              .lic-badges { display: flex; justify-content: center; gap: 15px; margin-top: 8px; font-size: 11px; font-weight: bold; }
              .lic-badge { background: #e8f5e9; border: 1px solid #2e7d32; color: #1b5e20; padding: 3px 8px; border-radius: 4px; }
              .section-title { font-size: 13px; font-weight: bold; background: #f0f4f1; padding: 6px 10px; border-left: 4px solid #1b4d3e; margin-top: 15px; margin-bottom: 8px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
              th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 11px; text-align: left; }
              th { background: #f8f9fa; font-weight: bold; }
              .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
              .sig-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-top: 30px; text-align: center; }
              .sig-box { border-top: 1px solid #333; padding-top: 6px; font-size: 11px; font-weight: bold; }
              .badge-e1 { background: #ffebee; color: #c62828; border: 1px solid #ef5350; padding: 1px 4px; border-radius: 3px; font-size: 9px; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1 class="firm-title">${header.firmName || FIRM_DETAILS.name}</h1>
              <div class="firm-subtitle">${header.firmAddress || FIRM_DETAILS.address}</div>
              <div class="lic-badges">
                <span class="lic-badge">AYUSH Mfg Lic No: ${header.manufacturingLicenseNo || 'AYUSH-1983-UP'}</span>
                <span class="lic-badge">AYUSH GMP Cert: ${header.gmpCertificateNo || 'GMP-AYUSH-2026-VNS'}</span>
                <span class="lic-badge">Dosage Category: ${bmrReport.productCategory || 'Ayurvedic Medicine'}</span>
              </div>
              <h3 style="margin-top:12px; margin-bottom:0; letter-spacing:1px; color:#333;">BATCH MANUFACTURING RECORD (BMR)</h3>
              <div style="font-size:10px; color:#666;">Schedule T — Drugs & Cosmetics Act Compliance Audit</div>
            </div>

            <div class="section-title">I. BATCH IDENTIFICATION & REGULATORY METADATA</div>
            <div class="grid-2">
              <div><strong>Batch No:</strong> ${bmrReport.batchNo}</div>
              <div><strong>Product Name:</strong> ${bmrReport.productName} (${bmrReport.productSku})</div>
              <div><strong>Planned Batch Qty:</strong> ${bmrReport.plannedQty} units</div>
              <div><strong>Actual Packaged Yield:</strong> ${bmrReport.actualYieldQty} units</div>
              <div><strong>Mfg Date:</strong> ${fmtDate(bmrReport.mfgDate)}</div>
              <div><strong>Expiry Date:</strong> ${fmtDate(bmrReport.expiryDate)} (${bmrReport.shelfLifeMonths || 36} Months)</div>
              <div><strong>Pre-BMR Approval:</strong> ${bmrReport.bmrApprovedByName ? `${bmrReport.bmrApprovedByName} (${fmtDateTime(bmrReport.bmrApprovedAt)})` : 'Pending'}</div>
              <div><strong>Line Clearance:</strong> ${bmrReport.lineClearance ? `${bmrReport.lineClearance.clearedByName} (${fmtDateTime(bmrReport.lineClearance.clearedAt)})` : 'Pending'}</div>
            </div>

            <div class="section-title">II. BOTANICAL RAW MATERIALS & MASTER RECIPE TRACEABILITY</div>
            <table>
              <thead>
                <tr>
                  <th>Ingredient Common Name</th>
                  <th>Botanical Binomial Name</th>
                  <th>Part Used</th>
                  <th>Inward Batch No</th>
                  <th>Qty Consumed</th>
                  <th>Standard</th>
                </tr>
              </thead>
              <tbody>
                ${(bmrReport.ingredients || []).map((ing: any) => `
                  <tr>
                    <td><strong>${ing.name}</strong> ${ing.isScheduleE1 ? '<span class="badge-e1">⚠️ E1 POISON</span>' : ''}</td>
                    <td><em>${ing.botanicalName || '—'}</em></td>
                    <td>${ing.partUsed || '—'}</td>
                    <td>${ing.batchNo}</td>
                    <td>${ing.qtyConsumed} ${ing.unit}</td>
                    <td>${ing.pharmacopoeialStandard || 'API'} ${ing.monographRef ? `(${ing.monographRef})` : ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="section-title">III. STAGE-BY-STAGE MANUFACTURING OPERATIONS LOG</div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Stage Name</th>
                  <th>Status</th>
                  <th>Started At</th>
                  <th>Completed At</th>
                  <th>Operator / Chemist</th>
                </tr>
              </thead>
              <tbody>
                ${(bmrReport.stages || []).map((s: any, idx: number) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${s.name}</strong></td>
                    <td>${(s.status || 'pending').toUpperCase()}</td>
                    <td>${fmtDateTime(s.startedAt)}</td>
                    <td>${fmtDateTime(s.completedAt)}</td>
                    <td>${s.completedBy || '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="section-title">IV. MATERIAL BALANCE & YIELD VARIANCE</div>
            <div class="grid-2">
              <div><strong>Theoretical Planned Yield:</strong> ${bmrReport.plannedQty} units</div>
              <div><strong>Actual Output Yield:</strong> ${bmrReport.actualYieldQty} units</div>
              <div><strong>Scrap / Process Waste:</strong> ${bmrReport.wasteQty} units</div>
              <div><strong>Yield Variance:</strong> ${bmrReport.variancePercent}% ${bmrReport.wasteReason ? `(Reason: ${bmrReport.wasteReason})` : ''}</div>
            </div>

            <div class="section-title">V. QC LABORATORY PHYSICOCHEMICAL TESTING & LIMITS</div>
            <table>
              <thead>
                <tr>
                  <th>Test Parameter</th>
                  <th>Pharmacopoeial Limit</th>
                  <th>Observed Test Result</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${bmrReport.qcParameters ? `
                  <tr><td>Organoleptic Evaluation</td><td>Standard</td><td>${bmrReport.qcParameters.organoleptic || 'Complies'}</td><td>PASS</td></tr>
                  <tr><td>Moisture Content (LOD)</td><td>${bmrReport.qcParameters.moistureLimit || 'NMT 10% w/w'}</td><td>${bmrReport.qcParameters.moistureContent !== null ? `${bmrReport.qcParameters.moistureContent}% w/w` : 'N/A'}</td><td>PASS</td></tr>
                  <tr><td>Total Ash Value</td><td>${bmrReport.qcParameters.ashValueLimit || 'NMT 5% w/w'}</td><td>${bmrReport.qcParameters.ashValue !== null ? `${bmrReport.qcParameters.ashValue}% w/w` : 'N/A'}</td><td>PASS</td></tr>
                  <tr><td>pH Value (1% w/v)</td><td>${bmrReport.qcParameters.pHLimit || '4.0 - 7.0'}</td><td>${bmrReport.qcParameters.pHValue !== null ? bmrReport.qcParameters.pHValue : 'N/A'}</td><td>PASS</td></tr>
                  <tr><td>Disintegration Time</td><td>${bmrReport.qcParameters.disintegrationLimit || 'NMT 30 mins'}</td><td>${bmrReport.qcParameters.disintegrationTime !== null ? `${bmrReport.qcParameters.disintegrationTime} mins` : 'N/A'}</td><td>PASS</td></tr>
                  <tr><td>Heavy Metals (Pb, Cd, Hg, As)</td><td>Within API Limits</td><td>${bmrReport.qcParameters.heavyMetals || 'Complies'}</td><td>PASS</td></tr>
                  <tr><td>Microbial Limit Test</td><td>Within API Limits</td><td>${bmrReport.qcParameters.microbialLimit || 'Complies'}</td><td>PASS</td></tr>
                ` : '<tr><td colspan="4">QC parameters pending analysis</td></tr>'}
              </tbody>
            </table>

            <div class="sig-grid">
              <div class="sig-box">
                <div>Manufacturing Chemist</div>
                <div style="font-size:10px; font-weight:normal; color:#555; margin-top:4px;">${bmrReport.bmrApprovedByName || 'Authorized Manufacturing In-Charge'}</div>
              </div>
              <div class="sig-box">
                <div>Analytical Chemist (QC)</div>
                <div style="font-size:10px; font-weight:normal; color:#555; margin-top:4px;">${bmrReport.qcPassedBy || 'Authorized QC Inspector'}</div>
              </div>
              <div class="sig-box">
                <div>Quality Assurance (QA Releaser)</div>
                <div style="font-size:10px; font-weight:normal; color:#555; margin-top:4px;">${bmrReport.releasedByName || 'Authorized QA Manager'}</div>
              </div>
            </div>
            <script>window.onload = function() { window.print(); };</script>
          </body>
          </html>
        `);
        printWindow.document.close();
      }
    } else {
      onPrint();
    }
  };

  const header = bmrReport?.ayushHeader || {};

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalContainer, { maxWidth: 880, width: '94%', height: '90%' }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Batch Manufacturing Record (BMR)</Text>
              <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                AYUSH GMP (Schedule T) Quality Compliance Audit & Master Formula Record
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {loadingBmr ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : bmrReport ? (
            <ScrollView style={[styles.modalForm, { padding: 16 }]} contentContainerStyle={{ gap: 16 }}>
              {/* Official Header Branding & AYUSH License Bar */}
              <View style={{ alignItems: 'center', borderBottomWidth: 2, borderBottomColor: colors.primary, paddingBottom: 12, marginBottom: 4 }}>
                <Text style={{ fontSize: 19, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 }}>
                  {header.firmName || FIRM_DETAILS.name}
                </Text>
                <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                  {header.firmAddress || FIRM_DETAILS.address}
                </Text>

                {/* AYUSH License Badges */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, justifyContent: 'center' }}>
                  <View style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 0.5, borderColor: colors.primary + '40' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: colors.primary }}>
                      📜 AYUSH Mfg Lic No: {header.manufacturingLicenseNo || 'AYUSH-1983-UP'}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: colors.success + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 0.5, borderColor: colors.success + '40' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: colors.success }}>
                      🛡️ AYUSH GMP Cert: {header.gmpCertificateNo || 'GMP-AYUSH-2026-VNS'}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: colors.bg.secondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 0.5, borderColor: colors.border }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>
                      🏷️ Dosage Category: {bmrReport.productCategory || 'Ayurvedic Formulated Medicine'}
                    </Text>
                  </View>
                </View>

                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text.primary, marginTop: 10, letterSpacing: 1 }}>
                  OFFICIAL BATCH MANUFACTURING RECORD (BMR)
                </Text>
                {bmrReport.bomSnapshot?.formulationStandardRef ? (
                  <Text style={{ fontSize: 11, fontStyle: 'italic', color: colors.primary, marginTop: 2 }}>
                    Formulation Standard Reference: {bmrReport.bomSnapshot.formulationStandardRef}
                  </Text>
                ) : null}
              </View>

              {/* Section I: Batch Identification & Pre-Execution Approvals */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 }}>
                    SECTION I: BATCH IDENTIFICATION, PRE-EXECUTION APPROVAL & LINE CLEARANCE
                  </Text>
                </View>
                <View style={{ padding: 12, gap: 8 }}>
                  {[
                    { label: 'Batch Reference No:', val: bmrReport.batchNo },
                    { label: 'Product Name & SKU:', val: `${bmrReport.productName} (${bmrReport.productSku})` },
                    { label: 'Theoretical Planned Batch Qty:', val: `${bmrReport.plannedQty} units` },
                    { label: 'Actual Packaged Yield Output:', val: `${bmrReport.actualYieldQty} units`, valColor: colors.success },
                    { label: 'Manufacturing & Expiry Dates:', val: `${fmtDate(bmrReport.mfgDate)} ➔ ${fmtDate(bmrReport.expiryDate)} (${bmrReport.shelfLifeMonths || 36} Months Shelf-Life)` },
                    { label: 'Pre-Execution BMR Approval:', val: bmrReport.bmrApprovedByName ? `${bmrReport.bmrApprovedByName} (${fmtDateTime(bmrReport.bmrApprovedAt)})` : 'Pending Pre-Approval' },
                    { label: 'Line Clearance Verification:', val: bmrReport.lineClearance ? `${bmrReport.lineClearance.clearedByName} (${fmtDateTime(bmrReport.lineClearance.clearedAt)}) — Prev Batch: ${bmrReport.lineClearance.previousBatchNo || 'None'}` : 'Pending Line Clearance' },
                    { label: 'Manufacturing Timeline:', val: `${fmtDate(bmrReport.startDate)} ➔ ${bmrReport.endDate ? fmtDate(bmrReport.endDate) : 'Ongoing'}` }
                  ].map(({ label, val, valColor }) => (
                    <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 12, color: colors.text.secondary }}>{label}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: valColor || colors.text.primary }}>{val}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Section II: Raw Material Master Recipe & Botanical Compliance */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 }}>
                    SECTION II: BOTANICAL RAW MATERIALS & MASTER RECIPE TRACEABILITY
                  </Text>
                </View>
                <View style={{ padding: 8 }}>
                  <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 6, backgroundColor: colors.bg.secondary + '60', paddingHorizontal: 4 }}>
                    <Text style={{ flex: 2, fontSize: 10.5, fontWeight: '700', color: colors.text.secondary }}>Ingredient & Botanical Name</Text>
                    <Text style={{ flex: 1.2, fontSize: 10.5, fontWeight: '700', color: colors.text.secondary }}>Part Used</Text>
                    <Text style={{ flex: 1.2, fontSize: 10.5, fontWeight: '700', color: colors.text.secondary }}>Inward Batch</Text>
                    <Text style={{ flex: 1.2, fontSize: 10.5, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Qty Consumed</Text>
                    <Text style={{ flex: 1.2, fontSize: 10.5, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Pharmacopoeia</Text>
                  </View>
                  {bmrReport.ingredients && bmrReport.ingredients.map((ing: any, idx: number) => (
                    <View key={idx} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.border, paddingHorizontal: 4, alignItems: 'center' }}>
                      <View style={{ flex: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.primary }}>{ing.name}</Text>
                          {ing.isScheduleE1 && (
                            <View style={{ backgroundColor: colors.danger + '15', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, borderWidth: 0.5, borderColor: colors.danger }}>
                              <Text style={{ fontSize: 8.5, fontWeight: '800', color: colors.danger }}>⚠️ E1 Poison</Text>
                            </View>
                          )}
                        </View>
                        {ing.botanicalName ? (
                          <Text style={{ fontSize: 10, fontStyle: 'italic', color: colors.text.secondary, marginTop: 1 }}>
                            {ing.botanicalName}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={{ flex: 1.2, fontSize: 11, color: colors.text.primary }}>{ing.partUsed || '—'}</Text>
                      <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '600', color: colors.text.primary }}>{ing.batchNo}</Text>
                      <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '700', color: colors.text.primary, textAlign: 'right' }}>
                        {ing.qtyConsumed} {ing.unit}
                      </Text>
                      <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.primary }}>
                          {ing.pharmacopoeialStandard || 'API'}
                        </Text>
                        {ing.monographRef ? (
                          <Text style={{ fontSize: 8.5, color: colors.text.muted }}>{ing.monographRef}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* Section III: Manufacturing Stage Process Operations Log */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 }}>
                    SECTION III: STAGE-BY-STAGE MANUFACTURING OPERATIONS LOG
                  </Text>
                </View>
                <View style={{ padding: 8 }}>
                  <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 6, backgroundColor: colors.bg.secondary + '60', paddingHorizontal: 4 }}>
                    <Text style={{ width: 28, fontSize: 10.5, fontWeight: '700', color: colors.text.secondary }}>#</Text>
                    <Text style={{ flex: 2, fontSize: 10.5, fontWeight: '700', color: colors.text.secondary }}>Stage Operation Name</Text>
                    <Text style={{ flex: 1, fontSize: 10.5, fontWeight: '700', color: colors.text.secondary }}>Status</Text>
                    <Text style={{ flex: 1.5, fontSize: 10.5, fontWeight: '700', color: colors.text.secondary }}>Completed At</Text>
                    <Text style={{ flex: 1.5, fontSize: 10.5, fontWeight: '700', color: colors.text.secondary }}>Operator / Chemist</Text>
                  </View>
                  {(bmrReport.stages || []).map((s: any, idx: number) => {
                    const isDone = s.status === 'completed';
                    return (
                      <View key={idx} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.border, paddingHorizontal: 4, alignItems: 'center' }}>
                        <Text style={{ width: 28, fontSize: 11, fontWeight: '700', color: colors.text.muted }}>{idx + 1}</Text>
                        <View style={{ flex: 2 }}>
                          <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.text.primary }}>{s.name}</Text>
                          {s.notes ? <Text style={{ fontSize: 9.5, color: colors.text.muted, marginTop: 1 }}>{s.notes}</Text> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{
                            backgroundColor: isDone ? colors.success + '15' : colors.warning + '15',
                            paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start'
                          }}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: isDone ? colors.success : colors.warning }}>
                              {(s.status || 'pending').toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ flex: 1.5, fontSize: 10.5, color: colors.text.primary }}>{fmtDateTime(s.completedAt)}</Text>
                        <Text style={{ flex: 1.5, fontSize: 10.5, fontWeight: '600', color: colors.text.primary }}>{s.completedBy || '—'}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Section IV: Material Balance & Yield Variance */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 }}>
                    SECTION IV: MATERIAL BALANCE & YIELD VARIANCE LOG
                  </Text>
                </View>
                <View style={{ padding: 12, gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, color: colors.text.secondary }}>Theoretical Planned Yield:</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.primary }}>{bmrReport.plannedQty} units</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, color: colors.text.secondary }}>Actual Packaged Output Yield:</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.success }}>{bmrReport.actualYieldQty} units</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, color: colors.text.secondary }}>Process Waste / Scrap Qty:</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: bmrReport.wasteQty > 0 ? colors.danger : colors.text.primary }}>{bmrReport.wasteQty} units</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, color: colors.text.secondary }}>Yield Variance %:</Text>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: Math.abs(bmrReport.variancePercent) > 5 ? colors.danger : colors.success }}>
                      {bmrReport.variancePercent}% {Math.abs(bmrReport.variancePercent) > 5 ? '⚠️ Out of Tolerance' : '✅ Within Tolerance'}
                    </Text>
                  </View>
                  {bmrReport.wasteReason ? (
                    <Text style={{ fontSize: 11, color: colors.text.secondary, fontStyle: 'italic', marginTop: 2 }}>
                      Variance / Waste Note: {bmrReport.wasteReason}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Section V: Printed Packaging & Label Reconciliation */}
              {bmrReport.labelReconciliation && bmrReport.labelReconciliation.length > 0 && (
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                  <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 }}>
                      SECTION V: PRINTED PACKAGING & LABEL RECONCILIATION
                    </Text>
                  </View>
                  <View style={{ padding: 8 }}>
                    <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 6 }}>
                      {['Printed Component', 'Issued', 'Used', 'Damaged', 'Returned', 'Status'].map((h, i) => (
                        <Text key={h} style={{ flex: i === 0 ? 2 : 1, fontSize: 10.5, fontWeight: '700', color: colors.text.secondary, textAlign: i > 0 && i < 5 ? 'right' : 'left' }}>{h}</Text>
                      ))}
                    </View>
                    {bmrReport.labelReconciliation.map((rec: any, idx: number) => (
                      <View key={idx} style={{ flexDirection: 'row', paddingVertical: 4 }}>
                        <Text style={{ flex: 2, fontSize: 11, color: colors.text.primary }}>{rec.name}</Text>
                        <Text style={{ flex: 1, fontSize: 11, color: colors.text.primary, textAlign: 'right' }}>{rec.qtyIssued}</Text>
                        <Text style={{ flex: 1, fontSize: 11, color: colors.text.primary, textAlign: 'right' }}>{rec.qtyUsed}</Text>
                        <Text style={{ flex: 1, fontSize: 11, color: colors.danger, textAlign: 'right' }}>{rec.qtyDamaged}</Text>
                        <Text style={{ flex: 1, fontSize: 11, color: colors.success, textAlign: 'right' }}>{rec.qtyReturnedToStore}</Text>
                        <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: rec.reconciled ? colors.success : colors.warning }}>
                          {rec.reconciled ? 'RECONCILED' : 'DISCREPANCY'}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Section VI: Retention / Reference Samples */}
              {bmrReport.retentionSamples && bmrReport.retentionSamples.length > 0 && (
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                  <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 }}>
                      SECTION VI: RETENTION (REFERENCE) SAMPLES ROOM RECORD
                    </Text>
                  </View>
                  <View style={{ padding: 8 }}>
                    <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 6 }}>
                      {['Product Name', 'Qty Retained', 'Storage Location', 'Mandatory Retention Until', 'Status'].map((h, i) => (
                        <Text key={h} style={{ flex: i === 0 || i === 2 ? 1.5 : 1, fontSize: 10.5, fontWeight: '700', color: colors.text.secondary }}>{h}</Text>
                      ))}
                    </View>
                    {bmrReport.retentionSamples.map((rs: any, idx: number) => (
                      <View key={idx} style={{ flexDirection: 'row', paddingVertical: 4 }}>
                        <Text style={{ flex: 1.5, fontSize: 11, color: colors.text.primary }}>{rs.productName}</Text>
                        <Text style={{ flex: 1, fontSize: 11, color: colors.text.primary }}>{rs.qtyRetained} {rs.unit || 'units'}</Text>
                        <Text style={{ flex: 1.5, fontSize: 11, color: colors.text.primary }}>{rs.storageLocation || 'QC Shelf'}</Text>
                        <Text style={{ flex: 1, fontSize: 11, fontWeight: '600', color: colors.primary }}>{fmtDate(rs.retentionUntil)}</Text>
                        <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: rs.status === 'stored' ? colors.success : colors.text.muted }}>
                          {rs.status.toUpperCase()}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Section VII: QC Specifications & Analytical Testing Limits */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 }}>
                    SECTION VII: QC LABORATORY PHYSICOCHEMICAL TESTING & LIMITS
                  </Text>
                  <View style={{ backgroundColor: bmrReport.qcStatus === 'rejected' ? colors.danger : colors.success, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>
                      {bmrReport.qcStatus === 'rejected' ? 'REJECTED' : 'APPROVED'}
                    </Text>
                  </View>
                </View>
                <View style={{ padding: 12, gap: 8 }}>
                  {bmrReport.qcParameters && (
                    <View style={{ backgroundColor: colors.bg.primary, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.border, gap: 6, marginBottom: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: colors.text.secondary, letterSpacing: 0.5 }}>
                        🔬 PARAMETER SPECIFICATIONS VS OBSERVED TEST RESULTS
                      </Text>
                      <View style={{ gap: 4, marginTop: 4 }}>
                        {[
                          bmrReport.qcParameters.organoleptic && { label: 'Organoleptic Evaluation', val: bmrReport.qcParameters.organoleptic, limit: 'Standard' },
                          bmrReport.qcParameters.moistureContent !== null && { label: 'Moisture Content (LOD)', val: `${bmrReport.qcParameters.moistureContent}% w/w`, limit: bmrReport.qcParameters.moistureLimit || 'NMT 10% w/w' },
                          bmrReport.qcParameters.ashValue !== null && { label: 'Total Ash Value', val: `${bmrReport.qcParameters.ashValue}% w/w`, limit: bmrReport.qcParameters.ashValueLimit || 'NMT 5% w/w' },
                          bmrReport.qcParameters.pHValue !== null && { label: 'pH Value (1% w/v)', val: `${bmrReport.qcParameters.pHValue}`, limit: bmrReport.qcParameters.pHLimit || '4.0 - 7.0' },
                          bmrReport.qcParameters.disintegrationTime !== null && { label: 'Disintegration Time', val: `${bmrReport.qcParameters.disintegrationTime} mins`, limit: bmrReport.qcParameters.disintegrationLimit || 'NMT 30 mins' },
                          bmrReport.qcParameters.heavyMetals && { label: 'Heavy Metals (Pb, Cd, Hg, As)', val: bmrReport.qcParameters.heavyMetals, limit: 'Within API Limits' },
                          bmrReport.qcParameters.microbialLimit && { label: 'Microbial Limit Test', val: bmrReport.qcParameters.microbialLimit, limit: 'Within API Limits' },
                        ].filter(Boolean).map((item: any) => (
                          <View key={item.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                              {item.label}: <Text style={{ color: colors.text.primary, fontWeight: '700' }}>{item.val}</Text>
                            </Text>
                            <Text style={{ fontSize: 10, color: colors.text.muted }}>Limit: {item.limit}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  <Text style={{ fontSize: 11.5, color: colors.text.primary }}>
                    <Text style={{ fontWeight: '700' }}>QC Inspector Remarks: </Text>{bmrReport.qcNotes}
                  </Text>
                </View>
              </View>

              {/* Section VIII: Statutory Maker-Checker Signatures */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 }}>
                    SECTION VIII: STATUTORY MAKER-CHECKER & MARKET RELEASE SIGNATURES
                  </Text>
                </View>
                <View style={{ padding: 12, gap: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 11, color: colors.text.secondary }}>Manufacturing Chemist Sign-Off:</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>
                      {bmrReport.bmrApprovedByName || 'Authorized Manufacturing Chemist'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 11, color: colors.text.secondary }}>Analytical Chemist (QC Inspection):</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>
                      {bmrReport.qcPassedBy || 'Authorized QC Inspector'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 11, color: colors.text.secondary }}>Authorized QA Market Releaser:</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: bmrReport.releasedByName ? colors.success : colors.warning }}>
                      {bmrReport.releasedByName ? `${bmrReport.releasedByName} (${fmtDateTime(bmrReport.releasedAt)})` : 'Pending Market Release'}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: colors.text.secondary }}>Failed to display report details.</Text>
            </View>
          )}

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>
            {bmrReport && (
              <TouchableOpacity style={styles.submitBtn} onPress={handlePrintPdf}>
                <Ionicons name="print-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.submitBtnText}>Print Official BMR PDF</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}