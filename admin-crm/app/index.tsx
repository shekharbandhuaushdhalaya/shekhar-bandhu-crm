import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, useWindowDimensions, Pressable, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors, Shadows } from '../constants/theme';
import { api, DashboardStats, Activity, Contact, Product, Invoice, Challan, ConsolidatedInventory, MrDashboardSummary } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';
import { useAuth } from '../utils/auth';
import { usePermission } from '../utils/permissions';
import Svg, { Path, Circle, Text as SvgText, Line, Defs, LinearGradient, Stop, Rect, G } from 'react-native-svg';

function MetricCard({ title, value, icon, color, colorLight, trend }: { title: string; value: string; icon: string; color: string; colorLight: string; trend: string }) {
  const styles = useStyles(createStyles);
  return (
    <Pressable 
      style={({ pressed }) => [
        styles.metricCard, 
        { borderTopColor: color, borderTopWidth: 3 },
        pressed && { transform: [{ scale: 0.98 }] }
      ]}
    >
      <View style={styles.metricHeader}>
        <Text style={styles.metricTitle}>{title}</Text>
        <View style={[styles.iconCircle, { backgroundColor: colorLight }]}>
          <Ionicons name={icon as any} size={15} color={color} />
        </View>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <View style={styles.metricFooter}>
        <Text style={[styles.metricTrend, { color }]}>{trend}</Text>
        <Text style={styles.metricSubtext}>vs last month</Text>
      </View>
    </Pressable>
  );
}

function PipelineChart({ contacts }: { contacts: Contact[] }) {
  const { themeMode, colors } = useTheme();
  const { width: winWidth } = useWindowDimensions();
  const styles = useStyles(createStyles);

  // If desktop (side-by-side view), width is roughly 60% of container. If mobile, full width.
  const width = winWidth > 900 ? (Math.min(winWidth, 1200) * 0.6) - 48 : winWidth - 64;
  const height = 220;
  const padX = 36;
  const padY = 28;
  const stages = ['lead', 'contacted', 'proposal', 'negotiation', 'won'];

  const values = stages.map(stage =>
    contacts.filter(c => c.stage === stage).reduce((s, c) => s + c.dealValue, 0)
  );

  const maxVal = Math.max(...values, 10000);
  const gW = width - padX * 2;
  const gH = height - padY * 2;

  const points = values.map((val, idx) => ({
    x: padX + (idx / (stages.length - 1)) * gW,
    y: padY + gH - (val / maxVal) * gH,
    val,
    label: stages[idx].toUpperCase().slice(0, 4),
  }));

  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const cpX = points[i - 1].x + (points[i].x - points[i - 1].x) / 2;
    pathD += ` C ${cpX} ${points[i - 1].y}, ${cpX} ${points[i].y}, ${points[i].x} ${points[i].y}`;
  }
  const fillD = `${pathD} L ${points[points.length - 1].x} ${padY + gH} L ${points[0].x} ${padY + gH} Z`;

  return (
    <View style={styles.chartCard}>
      <Text style={styles.sectionTitle}>Sales Pipeline Curve</Text>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.4" />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="lineG" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor={colors.primary} />
            <Stop offset="50%" stopColor={colors.purple} />
            <Stop offset="100%" stopColor={colors.success} />
          </LinearGradient>
        </Defs>
        <Line x1={padX} y1={padY + gH} x2={width - padX} y2={padY + gH} stroke={themeMode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'} />
        <Path d={fillD} fill="url(#glow)" />
        <Path d={pathD} fill="none" stroke="url(#lineG)" strokeWidth={3.5} strokeLinecap="round" />
        {points.map((pt, i) => (
          <Circle key={i} cx={pt.x} cy={pt.y} r={5} fill={colors.bg.primary} stroke={colors.purple} strokeWidth={2.5} />
        ))}
        {points.map((pt, i) => (
          <SvgText key={`l-${i}`} x={pt.x} y={padY + gH + 16} fill={colors.text.muted} fontSize={9} fontWeight="700" textAnchor="middle">{pt.label}</SvgText>
        ))}
        {points.map((pt, i) => (
          <SvgText key={`v-${i}`} x={pt.x} y={pt.y - 10} fill={colors.text.primary} fontSize={10} fontWeight="700" textAnchor="middle">₹{(pt.val / 1000).toFixed(0)}k</SvgText>
        ))}
      </Svg>
    </View>
  );
}

function ActivityFeed({ activities }: { activities: Activity[] }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  
  const dotColor = (type: string) => type === 'call' ? colors.info : type === 'email' ? colors.warning : type === 'meeting' ? colors.success : colors.primary;
  const timeAgo = (d: string) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  return (
    <View style={[styles.chartCard, { marginBottom: 0 }]}>
      <Text style={styles.sectionTitle}>Audit Activities</Text>
      {activities.slice(0, 5).map((a, i) => (
        <View key={i} style={styles.activityItem}>
          <View style={[styles.activityDot, { backgroundColor: dotColor(a.type) }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.activityText}>{a.text}</Text>
            <Text style={styles.activityTime}>{timeAgo(a.date)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function FinancialSummaryCard({ 
  title, 
  value, 
  label, 
  icon, 
  color,
  breakdown1Label,
  breakdown1Value,
  breakdown2Label,
  breakdown2Value
}: { 
  title: string; 
  value: string; 
  label: string; 
  icon: string; 
  color: string;
  breakdown1Label?: string;
  breakdown1Value?: string;
  breakdown2Label?: string;
  breakdown2Value?: string;
}) {
  const styles = useStyles(createStyles);
  const bgLight = color + '08';
  return (
    <Pressable 
      style={({ pressed }) => [
        styles.summaryCard, 
        { borderLeftColor: color, borderLeftWidth: 4 },
        pressed && { transform: [{ scale: 0.98 }] }
      ]}
    >
      <View style={styles.summaryCardHeader}>
        <Text style={styles.summaryCardTitle}>{title}</Text>
        <View style={[styles.iconCircle, { backgroundColor: bgLight }]}>
          <Ionicons name={icon as any} size={15} color={color} />
        </View>
      </View>
      <Text style={styles.summaryCardValue}>{value}</Text>
      
      {breakdown1Value || breakdown2Value ? (
        <View style={styles.breakdownRow}>
          {breakdown1Value ? (
            <View style={styles.breakdownItem}>
              {breakdown1Label ? <Text style={styles.breakdownLabel}>{breakdown1Label}</Text> : null}
              <Text style={styles.breakdownValue}>{breakdown1Value}</Text>
            </View>
          ) : null}
          {breakdown1Value && breakdown2Value ? <View style={styles.breakdownSeparator} /> : null}
          {breakdown2Value ? (
            <View style={styles.breakdownItem}>
              {breakdown2Label ? <Text style={styles.breakdownLabel}>{breakdown2Label}</Text> : null}
              <Text style={styles.breakdownValue}>{breakdown2Value}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.summaryCardLabel}>{label}</Text>
    </Pressable>
  );
}

function LowStockAlerts({ products }: { products: Product[] }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  
  return (
    <View style={styles.chartCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <Ionicons name="warning" size={18} color={colors.warning} style={{ marginRight: 8 }} />
        <Text style={styles.sectionTitle}>Reorder Level Alerts</Text>
      </View>
      {products.length === 0 ? (
        <Text style={{ color: colors.text.muted }}>All products are optimally stocked.</Text>
      ) : (
        <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
          {products.map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: i === products.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{p.name}</Text>
                <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 2 }}>SKU: {p.sku}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>{p.stockLevel} in stock</Text>
                <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 2 }}>Min required: {p.minReorder || 0}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function MonthlySalesWidget({ width, sales }: { width: number; sales: Invoice[] }) {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(createStyles);

  const [selectedFY, setSelectedFY] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Helper to get Financial Year
  const getFinancialYear = (dateStr: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11
    const startYear = month >= 3 ? year : year - 1;
    return `FY ${startYear}-${(startYear + 1).toString().slice(2)}`;
  };

  // Default current financial year
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentFYStart = currentMonth >= 3 ? currentYear : currentYear - 1;
  const currentFY = `FY ${currentFYStart}-${(currentFYStart + 1).toString().slice(2)}`;

  const availableYears = (() => {
    const yearsSet = new Set<string>();
    
    // Always include the current year and the past 2 years as standard options
    yearsSet.add(`FY ${currentFYStart - 2}-${(currentFYStart - 1).toString().slice(2)}`);
    yearsSet.add(`FY ${currentFYStart - 1}-${currentFYStart.toString().slice(2)}`);
    yearsSet.add(currentFY);

    sales.forEach(s => {
      if (s.isFinalized && s.date) {
        const fy = getFinancialYear(s.date);
        if (fy) yearsSet.add(fy);
      }
    });
    const arr = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
    return arr;
  })();

  useEffect(() => {
    if (!selectedFY && availableYears.length > 0) {
      setSelectedFY(availableYears[0]);
    }
  }, [availableYears, selectedFY]);

  const activeFY = selectedFY || currentFY;

  const FY_MONTHS = [
    { name: 'Apr', index: 3 },
    { name: 'May', index: 4 },
    { name: 'Jun', index: 5 },
    { name: 'Jul', index: 6 },
    { name: 'Aug', index: 7 },
    { name: 'Sep', index: 8 },
    { name: 'Oct', index: 9 },
    { name: 'Nov', index: 10 },
    { name: 'Dec', index: 11 },
    { name: 'Jan', index: 0 },
    { name: 'Feb', index: 1 },
    { name: 'Mar', index: 2 },
  ];

  const invoiceSales = Array(12).fill(0);

  const match = activeFY.match(/FY (\d{4})/);
  const startYear = match ? parseInt(match[1]) : currentFYStart;

  sales.forEach(s => {
    if (s.isFinalized && s.date) {
      const d = new Date(s.date);
      const y = d.getFullYear();
      const m = d.getMonth();
      
      const isWithinFY = (m >= 3 && y === startYear) || (m < 3 && y === startYear + 1);
      if (isWithinFY) {
        const monthIdx = m >= 3 ? m - 3 : m + 9;
        invoiceSales[monthIdx] += s.amount || 0;
      }
    }
  });

  const height = 250;
  const padX = 45;
  const padY = 30;
  const chartWidth = Math.max(width, 500);
  const gW = chartWidth - padX - 20;
  const gH = height - padY * 2 - 10;

  const maxVal = Math.max(...invoiceSales, 10000);
  const barWidth = Math.max(4, (gW / 12) * 0.4);

  return (
    <View style={[styles.chartCard, { zIndex: 10 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md, flexWrap: 'wrap', gap: 8, zIndex: 100 }}>
        <Text style={styles.chartTitle}>Monthly Sales Breakdown</Text>
        
        {/* Dropdown Selector for Financial Year */}
        <View style={{ position: 'relative', zIndex: 200 }}>
          <Pressable
            onPress={() => setIsDropdownOpen(!isDropdownOpen)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 6,
              backgroundColor: themeMode === 'dark' ? '#161b22' : '#f4f5f7',
              borderWidth: 1,
              borderColor: colors.border,
              gap: 6,
            }}
          >
            <Text style={{
              fontSize: 11,
              fontWeight: '700',
              color: colors.text.secondary,
            }}>
              {activeFY}
            </Text>
            <Ionicons name={isDropdownOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.text.secondary} />
          </Pressable>

          {isDropdownOpen && (
            <View style={{
              position: 'absolute',
              top: 36,
              right: 0,
              backgroundColor: colors.bg.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 6,
              width: 110,
              zIndex: 9999,
              boxShadow: '0px 4px 8px rgba(0,0,0,0.15)',
              elevation: 8,
              overflow: 'hidden',
            }}>
              {availableYears.map(fy => (
                <Pressable
                  key={fy}
                  onPress={() => {
                    setSelectedFY(fy);
                    setIsDropdownOpen(false);
                  }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    backgroundColor: activeFY === fy 
                      ? colors.primaryLight 
                      : (pressed ? (themeMode === 'dark' ? '#21262d' : '#ebecf0') : colors.bg.card),
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  })}
                >
                  <Text style={{
                    fontSize: 11,
                    fontWeight: activeFY === fy ? '700' : '600',
                    color: activeFY === fy ? colors.primary : colors.text.secondary,
                  }}>
                    {fy}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%' }}>
        <Svg width={chartWidth} height={height}>
        <Defs>
          <LinearGradient id="invoiceGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.primary} />
            <Stop offset="100%" stopColor={colors.primary + '40'} />
          </LinearGradient>
        </Defs>

        {/* Y Axis Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = padY + gH - (ratio * gH);
          return (
            <G key={i}>
              <SvgText x={padX - 8} y={y + 4} fill={colors.text.muted} fontSize={9} textAnchor="end">
                {`₹${((ratio * maxVal) / 1000).toFixed(0)}k`}
              </SvgText>
              <Line x1={padX} y1={y} x2={chartWidth - 20} y2={y} stroke={colors.border} strokeWidth={1} strokeDasharray="4 4" />
            </G>
          );
        })}

        {/* Draw Bars */}
        {FY_MONTHS.map((m, idx) => {
          const centerX = padX + (idx / 12) * gW + (gW / 12) / 2;
          
          // Invoice Bar (Pakka)
          const invVal = invoiceSales[idx];
          const invH = (Math.max(invVal, 0) / maxVal) * gH;
          const invX = centerX - barWidth / 2;
          const invY = padY + gH - invH;

          return (
            <G key={idx}>
              {/* Invoice Rect */}
              {invVal > 0 && (
                <Rect
                  x={invX}
                  y={invY}
                  width={barWidth}
                  height={invH}
                  fill="url(#invoiceGrad)"
                  rx={2}
                />
              )}

              {/* Month label at bottom */}
              <SvgText x={centerX} y={padY + gH + 16} fill={colors.text.secondary} fontSize={9} fontWeight="700" textAnchor="middle">
                {m.name}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      </ScrollView>

      {/* Legend */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: Spacing.xs }}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={styles.legendText}>Sales Revenue</Text>
        </View>
      </View>
    </View>
  );
}



function RadialOverviewChart({ width, recInvoice, recCash, payInvoice, payCash }: { width: number; recInvoice: number; recCash: number; payInvoice: number; payCash: number }) {
  const { colors, themeMode } = useTheme();
  const styles = useStyles(createStyles);

  const size = 180;
  const radius = 60;
  const strokeWidth = 14;
  const circ = 2 * Math.PI * radius;

  const totalInvoice = recInvoice + payInvoice;
  const totalCash = recCash + payCash;
  const grandTotal = totalInvoice + totalCash || 1;

  const invRatio = totalInvoice / grandTotal;
  const cashRatio = totalCash / grandTotal;

  const invOffset = circ * (1 - invRatio);
  const cashOffset = circ * (1 - cashRatio);

  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartTitle}>Outstanding Ledger Division (Invoice vs Cash)</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.lg, justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ alignSelf: 'center' }}>
          <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
            {/* Background ring */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={themeMode === 'dark' ? '#161b22' : '#dfe1e6'}
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* Invoice ring */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={colors.primary}
              strokeWidth={strokeWidth}
              strokeDasharray={circ}
              strokeDashoffset={invOffset}
              strokeLinecap="round"
              fill="none"
            />
            {/* Inner cash ring */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius - strokeWidth - 4}
              stroke={themeMode === 'dark' ? '#161b22' : '#dfe1e6'}
              strokeWidth={strokeWidth}
              fill="none"
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius - strokeWidth - 4}
              stroke={colors.warning}
              strokeWidth={strokeWidth}
              strokeDasharray={circ}
              strokeDashoffset={cashOffset}
              strokeLinecap="round"
              fill="none"
            />
          </G>
          {/* Inner labels */}
          <SvgText x={size / 2} y={size / 2 - 4} fill={colors.text.primary} fontSize={11} fontWeight="800" textAnchor="middle">
            {(invRatio * 100).toFixed(0)}% Invoice
          </SvgText>
          <SvgText x={size / 2} y={size / 2 + 12} fill={colors.text.secondary} fontSize={10} fontWeight="700" textAnchor="middle">
            {(cashRatio * 100).toFixed(0)}% Cash
          </SvgText>
        </Svg>

        <View style={{ gap: Spacing.sm }}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <View>
              <Text style={styles.legendText}>Invoice Ledger</Text>
              <Text style={styles.legendVal}>₹{totalInvoice.toLocaleString()}</Text>
            </View>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
            <View>
              <Text style={styles.legendText}>Cash Ledger</Text>
              <Text style={styles.legendVal}>₹{totalCash.toLocaleString()}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function getItemTotalPieces(item: any): number {
  const qty = item.qty || 0;
  const boxes = item.boxes || 0;
  const packing = item.packing || 1;
  return qty === boxes * packing ? qty : qty * packing;
}

function FullMrAnalyticsTab() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const [mrDashboard, setMrDashboard] = useState<MrDashboardSummary | null>(null);
  const [dateRange, setDateRange] = useState('thisMonth');

  const loadData = useCallback(async () => {
    try {
      const now = new Date();
      let from: string | undefined;
      let to: string | undefined;
      if (dateRange === 'thisMonth') {
        from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        to = now.toISOString();
      } else if (dateRange === 'lastMonth') {
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        to = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();
      } else if (dateRange === 'thisQuarter') {
        const q = Math.floor(now.getMonth() / 3);
        from = new Date(now.getFullYear(), q * 3, 1).toISOString();
        to = now.toISOString();
      }
      const data = await api.getMrDashboard(from, to);
      setMrDashboard(data);
    } catch (_) {}
  }, [dateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!mrDashboard) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ color: colors.text.muted, fontSize: 13 }}>Loading MR Field Analytics...</Text>
      </View>
    );
  }

  const { mrs: mrData, totals } = mrDashboard;

  return (
    <View style={{ gap: 16 }}>
      {/* Quick Navigation Banner to MR Attendance & Field Logs */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.primary + '10', padding: 14, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.primary + '30', flexWrap: 'wrap', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 240 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="location" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text.primary }}>MR Daily Attendance & GPS Logs</Text>
            <Text style={{ fontSize: 11, color: colors.text.secondary }}>Inspect live check-ins, check-outs, odometer distance & map coordinates</Text>
          </View>
        </View>

        <TouchableOpacity
          style={{
            backgroundColor: colors.primary,
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: Radius.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6
          }}
          onPress={() => router.push('/medicalreps')}
          activeOpacity={0.8}
        >
          <Ionicons name="footsteps-outline" size={16} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>View GPS Attendance</Text>
        </TouchableOpacity>
      </View>

      {/* Date Window Controls */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg.card, padding: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="calendar-outline" size={16} color={colors.primary} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>Performance Window:</Text>
        </View>
        <View style={{ flexDirection: 'row', backgroundColor: colors.bg.primary, padding: 2, borderRadius: Radius.sm, gap: 4 }}>
          {[
            { id: 'thisMonth', label: 'This Month' },
            { id: 'lastMonth', label: 'Last Month' },
            { id: 'thisQuarter', label: 'This Quarter' }
          ].map(d => (
            <Pressable
              key={d.id}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: Radius.sm,
                backgroundColor: dateRange === d.id ? colors.primary : 'transparent'
              }}
              onPress={() => setDateRange(d.id)}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: dateRange === d.id ? '#fff' : colors.text.secondary }}>
                {d.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* KPI Cards */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 150, backgroundColor: colors.bg.card, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: colors.primary + '30' }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted }}>DOCTOR VISITS</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.primary, marginTop: 4 }}>{totals.visits}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 150, backgroundColor: colors.bg.card, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: colors.success + '30' }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted }}>BOOKED ORDERS</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.success, marginTop: 4 }}>{totals.orders}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 150, backgroundColor: colors.bg.card, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: colors.warning + '30' }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted }}>TOTAL ORDER VALUE</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.warning, marginTop: 4 }}>₹{(totals.orderValue || 0).toLocaleString('en-IN')}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 150, backgroundColor: colors.bg.card, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: colors.danger + '30' }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted }}>EXPENSES SUBMITTED</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.danger, marginTop: 4 }}>₹{(totals.expenses || 0).toLocaleString('en-IN')}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 150, backgroundColor: colors.bg.card, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: colors.info + '30' }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted }}>DISTANCE COVERED</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.info, marginTop: 4 }}>{(totals.distance || 0).toFixed(0)} <Text style={{ fontSize: 14 }}>km</Text></Text>
        </View>
      </View>

      {/* Individual MR Performance Cards */}
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text.primary }}>
          MR INDIVIDUAL PERFORMANCE & ROI ({mrData.length} ACTIVE REPS)
        </Text>

        {mrData.map(m => {
          const roi = m.expenses > 0 ? (((m.orderValue - m.expenses) / m.expenses) * 100).toFixed(0) : '100+';
          const targetAchievement = m.monthlyTarget > 0 ? Math.min(100, Math.round((m.orderValue / m.monthlyTarget) * 100)) : 0;

          return (
            <View key={m._id} style={{ backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.primary }}>{m.name.charAt(0)}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text.primary }}>{m.name}</Text>
                    <Text style={{ fontSize: 11, color: colors.text.secondary }}>📍 {m.territory || 'Headquarters'} | Target: ₹{(m.monthlyTarget || 0).toLocaleString('en-IN')}</Text>
                  </View>
                </View>
                <View style={{ backgroundColor: Number(roi) > 0 ? colors.success + '18' : colors.warning + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: Number(roi) > 0 ? colors.success : colors.warning }}>
                    ROI: {roi}%
                  </Text>
                </View>
              </View>

              {/* Progress Bar */}
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted }}>MONTHLY TARGET PROGRESS</Text>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: colors.primary }}>{targetAchievement}% Achieved</Text>
                </View>
                <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{ width: `${targetAchievement}%`, height: '100%', backgroundColor: targetAchievement >= 100 ? colors.success : colors.primary }} />
                </View>
              </View>

              {/* Metrics Grid */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.bg.primary, padding: 10, borderRadius: Radius.md }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text.primary }}>{m.visits}</Text>
                  <Text style={{ fontSize: 9, color: colors.text.muted }}>Visits</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text.primary }}>{m.orders}</Text>
                  <Text style={{ fontSize: 9, color: colors.text.muted }}>Orders</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.success }}>₹{(m.orderValue || 0).toLocaleString('en-IN')}</Text>
                  <Text style={{ fontSize: 9, color: colors.text.muted }}>Sales</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.danger }}>₹{(m.expenses || 0).toLocaleString('en-IN')}</Text>
                  <Text style={{ fontSize: 9, color: colors.text.muted }}>Expenses</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.info }}>{m.totalDistance.toFixed(0)} km</Text>
                  <Text style={{ fontSize: 9, color: colors.text.muted }}>Distance</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function FullManufacturingAnalyticsTab({ mfgAnalytics }: { mfgAnalytics: any }) {
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  if (!mfgAnalytics) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.text.muted, fontSize: 13, marginTop: 12 }}>Loading Manufacturing Analytics...</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        🏭 Manufacturing Facility Financial & Asset Valuation
      </Text>

      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 16 }}>
        {/* Raw Materials Valuation */}
        <View style={[styles.chartCard, { flex: 1, padding: 16, marginBottom: 0 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.success + '15', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="leaf-outline" size={20} color={colors.success} />
            </View>
            <View>
              <Text style={{ fontSize: 11, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }}>Raw Stock Valuation</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text.primary, marginTop: 4 }}>
                ₹{(mfgAnalytics?.netRawMaterialValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        </View>

        {/* Finished Goods Valuation */}
        <View style={[styles.chartCard, { flex: 1, padding: 16, marginBottom: 0 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="cube-outline" size={20} color={colors.primary} />
            </View>
            <View>
              <Text style={{ fontSize: 11, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }}>Finished Goods Value</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text.primary, marginTop: 4 }}>
                ₹{(mfgAnalytics?.netFinishedGoodsValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        </View>

        {/* Facility Total Value */}
        <View style={[styles.chartCard, { flex: 1, padding: 16, backgroundColor: colors.primary + '05', marginBottom: 0 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + '25', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="wallet-outline" size={20} color={colors.primary} />
            </View>
            <View>
              <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Facility Assets</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary, marginTop: 4 }}>
                ₹{((mfgAnalytics?.netRawMaterialValue || 0) + (mfgAnalytics?.netFinishedGoodsValue || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Yield Efficiencies */}
      <View style={[styles.chartCard, { padding: 16 }]}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary, marginBottom: 16 }}>Yield Performance & Recipe Efficiency</Text>
        
        {mfgAnalytics?.yieldPerformance && mfgAnalytics.yieldPerformance.length > 0 ? (
          <View style={{ gap: 16 }}>
            {mfgAnalytics.yieldPerformance.map((item: any, idx: number) => {
              const isLow = item.efficiency < 95;
              const barColor = isLow ? colors.warning : colors.success;
              return (
                <View key={idx}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary }}>Batch: {item.batchNo} · {item.productName}</Text>
                      <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>Yielded {item.actualYieldQty} / {item.plannedQty} planned units</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: barColor }}>{item.efficiency}%</Text>
                  </View>
                  {/* Progress bar */}
                  <View style={{ height: 8, width: '100%', backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${Math.min(100, item.efficiency)}%`, backgroundColor: barColor }} />
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={{ alignItems: 'center', padding: 24 }}>
            <Ionicons name="bar-chart-outline" size={32} color={colors.text.secondary} />
            <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 8 }}>No completed yield batches to analyze.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;
  const chartWidth = isDesktop ? (Math.min(winWidth, 1200) - 240 - 64) * 0.5 - 20 : winWidth - 64;
  const [activeTab, setActiveTab] = useState<'overview' | 'mr_analytics' | 'manufacturing_analytics'>('overview');
  const [mfgAnalytics, setMfgAnalytics] = useState<any>(null);
  const [stats, setStats] = useState<DashboardStats>({ totalPipeline: 0, closedWon: 0, activeLeadsCount: 0, pendingTasksCount: 0 });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [recInvoice, setRecInvoice] = useState(0);
  const [payInvoice, setPayInvoice] = useState(0);
  const [assetValue, setAssetValue] = useState(0);
  const [salesVolume, setSalesVolume] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCOGS, setTotalCOGS] = useState(0);
  const [lowStockProds, setLowStockProds] = useState<Product[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [consolidatedInv, setConsolidatedInv] = useState<ConsolidatedInventory[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [allSales, setAllSales] = useState<Invoice[]>([]);
  const [allChallans, setAllChallans] = useState<Challan[]>([]);
  
  const { user } = useAuth();
  const perm = usePermission();
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const load = useCallback(async () => {
    const [s, a, c, custs, vends, invs, prods, purchs, sales, challans, mfgData] = await Promise.all([
      api.getStats(), 
      api.getActivities(), 
      api.getContacts(),
      api.getCustomers(),
      api.getVendors(),
      api.getConsolidatedInventory(),
      api.getProducts(),
      api.getPurchaseInvoices('', 'all'),
      api.getSaleInvoices('', 'all'),
      api.getChallans('', 'all'),
      api.getManufacturingAnalytics().catch(() => null)
    ]);
    if (mfgData) setMfgAnalytics(mfgData);

    const recInvoiceSum = custs.reduce((sum, cust) => sum + (cust.pakkaBalance || 0), 0);
    const payInvoiceSum = vends.reduce((sum, vend) => sum + (vend.pakkaBalance || 0), 0);
    
    // Calculate the asset value: purchases minus sales at purchase price
    let purchaseInvoiceSum = 0;
    const purchaseRatesMap: Record<string, number> = {};
    
    purchs.forEach(p => {
      if (p.isFinalized) {
        (p.items || []).forEach(item => {
          const pcs = getItemTotalPieces(item);
          const rate = item.rate || 0;
          const val = pcs * rate;
          purchaseInvoiceSum += val;
          
          if (item.productId) {
            purchaseRatesMap[item.productId] = rate;
          }
        });
      }
    });

    let saleInvoiceSub = 0;
    sales.forEach(s => {
      if (s.isFinalized) {
        (s.items || []).forEach(item => {
          const pcs = getItemTotalPieces(item);
          
          let purchasePrice = 0;
          if (item.productId && purchaseRatesMap[item.productId] !== undefined) {
            purchasePrice = purchaseRatesMap[item.productId];
          } else {
            const product = prods.find(p => p._id === item.productId);
            purchasePrice = product ? (product.price || 0) : 0;
          }
          
          const val = pcs * purchasePrice;
          saleInvoiceSub += val;
        });
      }
    });

    const assetInvoiceSum = Math.max(0, purchaseInvoiceSum - saleInvoiceSub);
    const volSum = custs.reduce((sum, cust) => sum + (cust.salesVolume || 0), 0);
    const revenueSum = sales.reduce((sum, s) => sum + (s.isFinalized ? s.amount || 0 : 0), 0);
    const cogsSum = saleInvoiceSub;
    const lowStock = prods.filter(p => typeof p.minReorder === 'number' && p.stockLevel <= p.minReorder);

    setRecInvoice(recInvoiceSum);
    setPayInvoice(payInvoiceSum);
    setAssetValue(assetInvoiceSum);
    setSalesVolume(volSum);
    setTotalRevenue(revenueSum);
    setTotalCOGS(cogsSum);
    setLowStockProds(lowStock);
    setProducts(prods);
    setConsolidatedInv(invs);
    setAllSales(sales);
    setAllChallans(challans);
    
    setStats(s);
    setActivities(a);
    setContacts(c);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const sub1 = DeviceEventEmitter.addListener('inventory_updated_event', () => load());
    const sub2 = DeviceEventEmitter.addListener('mfg_stage_updated_event', () => load());
    const sub3 = DeviceEventEmitter.addListener('mfg_batch_created_event', () => load());
    const sub4 = DeviceEventEmitter.addListener('new_web_order_event', () => load());

    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
      sub4.remove();
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await api.checkConnection();
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
      {/* Main Top Dashboard Tab Navigation */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: 4, marginBottom: Spacing.lg, borderWidth: 1, borderColor: colors.border }}>
        <Pressable
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 10,
            borderRadius: Radius.md,
            backgroundColor: activeTab === 'overview' ? colors.primary : 'transparent'
          }}
          onPress={() => setActiveTab('overview')}
        >
          <Ionicons name="pie-chart-outline" size={16} color={activeTab === 'overview' ? '#fff' : colors.text.secondary} />
          <Text style={{ fontSize: 13, fontWeight: '800', color: activeTab === 'overview' ? '#fff' : colors.text.secondary }}>
            Business Overview
          </Text>
        </Pressable>

        <Pressable
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 10,
            borderRadius: Radius.md,
            backgroundColor: activeTab === 'mr_analytics' ? colors.primary : 'transparent'
          }}
          onPress={() => setActiveTab('mr_analytics')}
        >
          <Ionicons name="stats-chart-outline" size={16} color={activeTab === 'mr_analytics' ? '#fff' : colors.text.secondary} />
          <Text style={{ fontSize: 13, fontWeight: '800', color: activeTab === 'mr_analytics' ? '#fff' : colors.text.secondary }}>
            MR Field & ROI
          </Text>
        </Pressable>

        <Pressable
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 10,
            borderRadius: Radius.md,
            backgroundColor: activeTab === 'manufacturing_analytics' ? colors.primary : 'transparent'
          }}
          onPress={() => setActiveTab('manufacturing_analytics')}
        >
          <Ionicons name="build-outline" size={16} color={activeTab === 'manufacturing_analytics' ? '#fff' : colors.text.secondary} />
          <Text style={{ fontSize: 13, fontWeight: '800', color: activeTab === 'manufacturing_analytics' ? '#fff' : colors.text.secondary }}>
            Manufacturing Facility Analytics
          </Text>
        </Pressable>
      </View>

      {activeTab === 'overview' ? (
        <>
          {/* E-Commerce Performance Panel */}
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.primary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            🛒 E-Commerce Channel Stats
          </Text>
      <View style={[styles.metricsGrid, { marginBottom: Spacing.lg }]}>
        <MetricCard 
          title="E-COMM SALES" 
          value={`₹${(stats.totalWebSales || 0).toLocaleString()}`} 
          icon="cart-outline" 
          color={colors.primary} 
          colorLight={colors.primaryLight} 
          trend="Live Storefront" 
        />
        <MetricCard 
          title="ACTIVE WEB ORDERS" 
          value={`${stats.activeWebOrdersCount || 0}`} 
          icon="sync-outline" 
          color={colors.warning} 
          colorLight={colors.warningLight} 
          trend="Needs Processing" 
        />
        <MetricCard 
          title="COMPLETED DELIVERIES" 
          value={`${stats.completedWebOrdersCount || 0}`} 
          icon="checkmark-done-circle-outline" 
          color={colors.success} 
          colorLight={colors.successLight} 
          trend="Successfully Shipped" 
        />
        <MetricCard 
          title="WEB INQUIRIES" 
          value={`${stats.webQueriesCount || 0}`} 
          icon="chatbubble-ellipses-outline" 
          color={colors.info} 
          colorLight={colors.infoLight} 
          trend="Enquiries / Quizzes" 
        />
      </View>

      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text.secondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        📊 B2B Ledger &amp; Inventory
      </Text>
      <View style={styles.metricsGrid}>
        <FinancialSummaryCard 
          title="TOTAL RECEIVABLES" 
          value={`₹${recInvoice.toLocaleString()}`} 
          label="Owed by Customers" 
          icon="arrow-down-circle" 
          color={colors.success}
        />
        {perm.can('report:view') && (
          <FinancialSummaryCard 
            title="TOTAL PAYABLES" 
            value={`₹${payInvoice.toLocaleString()}`} 
            label="Owed to Vendors" 
            icon="arrow-up-circle" 
            color={colors.warning}
          />
        )}
        {perm.can('report:view') && (
          <FinancialSummaryCard 
            title="ASSET VALUE" 
            value={`₹${assetValue.toLocaleString()}`} 
            label="Warehouse Stock Value" 
            icon="cube" 
            color={colors.primary}
          />
        )}
        {perm.can('report:view') && (
          <FinancialSummaryCard 
            title="PROFIT & LOSS" 
            value={`₹${(totalRevenue - totalCOGS).toLocaleString()}`} 
            label={`Margin: ${totalRevenue ? (((totalRevenue - totalCOGS) / totalRevenue) * 100).toFixed(1) : 0}%`} 
            icon="trending-up" 
            color={colors.purple} 
            breakdown1Label="REVENUE"
            breakdown1Value={`₹${totalRevenue.toLocaleString()}`}
            breakdown2Label="COGS (COST)"
            breakdown2Value={`₹${totalCOGS.toLocaleString()}`}
          />
        )}
      </View>

      <View style={styles.chartsFeedRow}>
        {perm.can('report:view') && (
          <View style={styles.chartWrapper}>
            <MonthlySalesWidget width={chartWidth} sales={allSales} />
          </View>
        )}
        <View style={styles.feedWrapper}>
          <LowStockAlerts products={lowStockProds} />
        </View>
      </View>

        </>
      ) : activeTab === 'mr_analytics' ? (
        <FullMrAnalyticsTab />
      ) : (
        <FullManufacturingAnalyticsTab mfgAnalytics={mfgAnalytics} />
      )}
    </ScrollView>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: Spacing.lg, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  heading: { fontSize: 28, fontWeight: '800', color: colors.text.primary, marginBottom: 4 },
  subheading: { fontSize: 14, color: colors.text.secondary, marginBottom: Spacing.lg },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.md },
  metricCard: { flexGrow: 1, flexShrink: 1, flexBasis: 240, backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: colors.border, ...Shadows.card },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  metricTitle: { fontSize: 11, fontWeight: '700', color: colors.text.muted, letterSpacing: 0.5 },
  metricValue: { fontSize: 26, fontWeight: '800', color: colors.text.primary, marginBottom: 4 },
  metricTrend: { fontSize: 12, fontWeight: '600' },
  metricFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.xs },
  metricSubtext: { fontSize: 11, color: colors.text.muted },
  summaryCard: { flexGrow: 1, flexShrink: 1, flexBasis: 240, backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: colors.border, ...Shadows.card },
  summaryCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  summaryCardTitle: { fontSize: 10, fontWeight: '700', color: colors.text.muted, letterSpacing: 0.5 },
  summaryCardValue: { fontSize: 24, fontWeight: '800', color: colors.text.primary, marginBottom: 4 },
  summaryCardLabel: { fontSize: 11, color: colors.text.secondary },
  breakdownRow: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 8, alignItems: 'center' },
  breakdownItem: { flex: 1 },
  breakdownLabel: { fontSize: 9, color: colors.text.muted, fontWeight: '700', letterSpacing: 0.5 },
  breakdownValue: { fontSize: 14, fontWeight: '700', color: colors.text.primary, marginTop: 2 },
  breakdownSeparator: { width: 1, backgroundColor: colors.border, alignSelf: 'stretch', marginVertical: 2 },
  chartLegend: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: Spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: colors.text.secondary, fontWeight: '600' },
  legendVal: { fontSize: 13, color: colors.text.primary, fontWeight: '700', marginTop: 2 },
  chartCard: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: Spacing.lg, ...Shadows.card },
  chartTitle: { fontSize: 15, fontWeight: '700', color: colors.text.primary, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text.primary, marginBottom: Spacing.md },
  activityItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  activityDot: { width: 9, height: 9, borderRadius: 5, marginTop: 4 },
  activityText: { fontSize: 13, color: colors.text.primary, fontWeight: '500' },
  activityTime: { fontSize: 11, color: colors.text.muted, marginTop: 2 },
  chartsFeedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, width: '100%' },
  chartWrapper: { flexGrow: 2, flexShrink: 1, flexBasis: 500 },
  feedWrapper: { flexGrow: 1, flexShrink: 1, flexBasis: 350 },
  iconCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
