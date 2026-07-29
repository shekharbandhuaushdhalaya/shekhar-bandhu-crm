import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { createStyles } from '../manufacturingStyles';

interface Props {
  mfgAnalytics: any;
  onOpenBMR: (id: string) => void;
  getStatusColor: (status: string) => string;
}

export default function ProductionSchedulerTab({
  mfgAnalytics, onOpenBMR, getStatusColor
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.tabContent}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Visual Batch Timeline</Text>
      </View>

      {mfgAnalytics?.timeline && mfgAnalytics.timeline.length > 0 ? (
        <View style={{ gap: 12 }}>
          {mfgAnalytics.timeline.map((run: any) => {
            const start = new Date(run.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            const end = run.endDate ? new Date(run.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'In Progress';
            const statusColor = getStatusColor(run.status);
            return (
              <View key={run.id} style={[styles.card, { borderLeftColor: statusColor, borderLeftWidth: 5, padding: 16 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary }}>Batch: {run.batchNo}</Text>
                    <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>{run.productName}</Text>
                  </View>
                  <View style={[styles.statusBadge, { borderColor: statusColor, backgroundColor: statusColor + '10', alignSelf: 'center' }]}>
                    <Text style={{ color: statusColor, fontSize: 10, fontWeight: '800' }}>{run.status.toUpperCase()}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 8, padding: 12, backgroundColor: colors.bg.secondary, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                  <View>
                    <Text style={{ fontSize: 10, color: colors.text.secondary, fontWeight: '700' }}>PLANNED QTY</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary, marginTop: 2 }}>{run.plannedQty} units</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 10, color: colors.text.secondary, fontWeight: '700' }}>ACTUAL YIELD</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary, marginTop: 2 }}>{run.actualYieldQty || '-'} units</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 10, color: colors.text.secondary, fontWeight: '700' }}>TIMEFRAME</Text>
                    <Text style={{ fontSize: 11, color: colors.text.primary, marginTop: 2 }}>{start} ➔ {end}</Text>
                  </View>
                </View>

                {/* Current Active Stage & Timeline Warnings */}
                {run.status === 'in_progress' && (() => {
                  const activeStage = run.stages?.find((s: any) => s.status === 'in_progress');
                  if (!activeStage) return null;
                  const targetDate = activeStage.targetCompletionDate ? new Date(activeStage.targetCompletionDate) : null;
                  const isOverdue = targetDate ? new Date() > targetDate : false;
                  let daysDiff = 0;
                  if (targetDate) {
                    const timeDiff = new Date().getTime() - targetDate.getTime();
                    daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
                  }
                  return (
                    <View style={{ padding: 10, backgroundColor: isOverdue ? colors.danger + '08' : colors.primary + '08', borderRadius: 8, borderWidth: 1, borderColor: isOverdue ? colors.danger : colors.primary + '20', marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.secondary }}>
                          Active Stage: <Text style={{ color: colors.text.primary }}>{activeStage.name}</Text>
                        </Text>
                        {targetDate && (
                          <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>
                            Target Completion: {targetDate.toLocaleDateString('en-IN')} ({activeStage.targetDurationDays} day{activeStage.targetDurationDays > 1 ? 's' : ''})
                          </Text>
                        )}
                      </View>
                      {targetDate && (
                        <View style={[styles.statusBadge, {
                          borderColor: isOverdue ? colors.danger : colors.success,
                          backgroundColor: isOverdue ? colors.danger + '12' : colors.success + '12',
                        }]}>
                          <Text style={{ fontSize: 8, fontWeight: '700', color: isOverdue ? colors.danger : colors.success }}>
                            {isOverdue ? `OVERDUE BY ${daysDiff} DAYS` : 'ON TRACK'}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })()}

                {/* Mini Visual Process Flow Stepper */}
                {run.stages && run.stages.length > 0 && (
                  <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: colors.text.secondary, marginBottom: 6, letterSpacing: 0.5 }}>PROCESS FLOW STAGES:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                      {run.stages.map((st: any, idx: number) => {
                        const isDone = st.status === 'completed' || st.status === 'skipped';
                        const isCurrent = st.status === 'in_progress';
                        const isFailed = st.status === 'failed';
                        let dotColor = colors.border;
                        if (isDone) dotColor = colors.success;
                        else if (isCurrent) dotColor = colors.primary;
                        else if (isFailed) dotColor = colors.danger;

                        return (
                          <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
                            <Text style={{ fontSize: 10, fontWeight: isCurrent ? '700' : '400', color: isCurrent ? colors.text.primary : colors.text.secondary }}>
                              {st.name}
                            </Text>
                            {idx < run.stages.length - 1 && (
                              <Ionicons name="arrow-forward" size={8} color={colors.text.muted} />
                            )}
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {run.status === 'completed' && (
                  <TouchableOpacity
                    style={[styles.outlineBtn, { marginTop: 12, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12 }]}
                    onPress={() => onOpenBMR(run.id)}
                  >
                    <Ionicons name="document-text-outline" size={14} color={colors.primary} />
                    <Text style={[styles.outlineBtnText, { fontSize: 12 }]}>Generate BMR Report</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={48} color={colors.text.secondary} />
          <Text style={styles.emptyText}>No active or completed production timeline found.</Text>
        </View>
      )}
    </View>
  );
}
