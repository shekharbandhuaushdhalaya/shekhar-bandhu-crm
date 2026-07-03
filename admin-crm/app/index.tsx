import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, useWindowDimensions, Pressable, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors, Shadows } from '../constants/theme';
import { api, DashboardStats, Activity, Contact, Product, Invoice, Challan, ConsolidatedInventory } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';
import { useAuth } from '../utils/auth';
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
  invoiceValue,
  cashValue
}: { 
  title: string; 
  value: string; 
  label: string; 
  icon: string; 
  color: string;
  invoiceValue?: string;
  cashValue?: string;
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
      
      {invoiceValue || cashValue ? (
        <View style={styles.breakdownRow}>
          {invoiceValue ? (
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>INVOICE</Text>
              <Text style={styles.breakdownValue}>{invoiceValue}</Text>
            </View>
          ) : null}
          {invoiceValue && cashValue ? <View style={styles.breakdownSeparator} /> : null}
          {cashValue ? (
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>CASH</Text>
              <Text style={styles.breakdownValue}>{cashValue}</Text>
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

function MonthlySalesWidget({ width, sales, challans }: { width: number; sales: Invoice[]; challans: Challan[] }) {
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
    challans.forEach(ch => {
      if (ch.status === 'finalized' && ch.mode === 'kachha' && !ch.convertedToInvoice && ch.date) {
        const fy = getFinancialYear(ch.date);
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
  const cashSales = Array(12).fill(0);

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
        if (s.mode === 'pakka') {
          invoiceSales[monthIdx] += s.amount || 0;
        } else {
          cashSales[monthIdx] += s.amount || 0;
        }
      }
    }
  });

  challans.forEach(ch => {
    if (ch.status === 'finalized' && ch.mode === 'kachha' && !ch.convertedToInvoice && ch.date) {
      const d = new Date(ch.date);
      const y = d.getFullYear();
      const m = d.getMonth();
      
      const isWithinFY = (m >= 3 && y === startYear) || (m < 3 && y === startYear + 1);
      if (isWithinFY) {
        const monthIdx = m >= 3 ? m - 3 : m + 9;
        cashSales[monthIdx] += ch.nettTotal || ch.baseAmount || 0;
      }
    }
  });

  const height = 250;
  const padX = 45;
  const padY = 30;
  const chartWidth = Math.max(width, 500);
  const gW = chartWidth - padX - 20;
  const gH = height - padY * 2 - 10;

  const maxVal = Math.max(...invoiceSales, ...cashSales, 10000);
  const barWidth = Math.max(4, (gW / 12) * 0.3);
  const gap = 2;

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
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
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
          <LinearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.warning} />
            <Stop offset="100%" stopColor={colors.warning + '40'} />
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
          const invX = centerX - barWidth - gap / 2;
          const invY = padY + gH - invH;

          // Cash Bar (Kachha)
          const cashVal = cashSales[idx];
          const cashH = (Math.max(cashVal, 0) / maxVal) * gH;
          const cashX = centerX + gap / 2;
          const cashY = padY + gH - cashH;

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
              
              {/* Cash Rect */}
              {cashVal > 0 && (
                <Rect
                  x={cashX}
                  y={cashY}
                  width={barWidth}
                  height={cashH}
                  fill="url(#cashGrad)"
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
          <Text style={styles.legendText}>Invoice</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
          <Text style={styles.legendText}>Cash</Text>
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

export default function DashboardScreen() {
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;
  const chartWidth = isDesktop ? (Math.min(winWidth, 1200) - 240 - 64) * 0.5 - 20 : winWidth - 64;
  const [stats, setStats] = useState<DashboardStats>({ totalPipeline: 0, closedWon: 0, activeLeadsCount: 0, pendingTasksCount: 0 });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [recInvoice, setRecInvoice] = useState(0);
  const [recCash, setRecCash] = useState(0);
  const [payInvoice, setPayInvoice] = useState(0);
  const [payCash, setPayCash] = useState(0);
  const [assetValue, setAssetValue] = useState(0);
  const [assetInvoice, setAssetInvoice] = useState(0);
  const [assetCash, setAssetCash] = useState(0);
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
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const load = useCallback(async () => {
    const [s, a, c, custs, vends, invs, prods, purchs, sales, challans] = await Promise.all([
      api.getStats(), 
      api.getActivities(), 
      api.getContacts(),
      api.getCustomers(),
      api.getVendors(),
      api.getConsolidatedInventory(),
      api.getProducts(),
      api.getPurchaseInvoices('', 'all'),
      api.getSaleInvoices('', 'all'),
      api.getChallans('', 'all')
    ]);

    const recInvoiceSum = custs.reduce((sum, cust) => sum + (cust.pakkaBalance || 0), 0);
    const recCashSum = custs.reduce((sum, cust) => sum + (cust.kachhaBalance || 0), 0);
    const payInvoiceSum = vends.reduce((sum, vend) => sum + (vend.pakkaBalance || 0), 0);
    const payCashSum = vends.reduce((sum, vend) => sum + (vend.kachhaBalance || 0), 0);
    
    // Calculate the asset value: purchases minus sales at purchase price
    let purchaseInvoiceSum = 0;
    let purchaseCashSum = 0;
    const purchaseRatesMap: Record<string, number> = {};
    
    purchs.forEach(p => {
      if (p.isFinalized) {
        (p.items || []).forEach(item => {
          const pcs = getItemTotalPieces(item);
          const rate = item.rate || 0;
          const val = pcs * rate;
          
          if (p.mode === 'pakka') {
            purchaseInvoiceSum += val;
          } else {
            purchaseCashSum += val;
          }
          
          if (item.productId) {
            purchaseRatesMap[item.productId] = rate;
          }
        });
      }
    });

    let saleInvoiceSub = 0;
    let saleCashSub = 0;
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
          
          if (s.mode === 'pakka') {
            saleInvoiceSub += val;
          } else {
            saleCashSub += val;
          }
        });
      }
    });

    // Count finalized cash (kachha) challans as cash sales (deducting cash asset value)
    challans.forEach(ch => {
      if (ch.status === 'finalized' && ch.mode === 'kachha') {
        (ch.items || []).forEach(item => {
          const pcs = getItemTotalPieces(item);
          
          let purchasePrice = 0;
          if (item.productId && purchaseRatesMap[item.productId] !== undefined) {
            purchasePrice = purchaseRatesMap[item.productId];
          } else {
            const product = prods.find(p => p._id === item.productId);
            purchasePrice = product ? (product.price || 0) : 0;
          }
          
          const val = pcs * purchasePrice;
          saleCashSub += val;
        });
      }
    });

    const assetInvoiceSum = Math.max(0, purchaseInvoiceSum - saleInvoiceSub);
    const assetCashSum = Math.max(0, purchaseCashSum - saleCashSub);
    
    const volSum = custs.reduce((sum, cust) => sum + (cust.salesVolume || 0), 0);

    const revenueSum = sales.reduce((sum, s) => sum + (s.isFinalized ? s.amount || 0 : 0), 0);
    const cogsSum = saleInvoiceSub + saleCashSub;
    // Consider a product low-stock when its current stock is less than or equal to its reorder level.
    const lowStock = prods.filter(p => typeof p.minReorder === 'number' && p.stockLevel <= p.minReorder);

    setRecInvoice(recInvoiceSum);
    setRecCash(recCashSum);
    setPayInvoice(payInvoiceSum);
    setPayCash(payCashSum);
    setAssetInvoice(assetInvoiceSum);
    setAssetCash(assetCashSum);
    setAssetValue(assetInvoiceSum + assetCashSum);
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await api.checkConnection();
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
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
          value={`₹${(recInvoice + recCash).toLocaleString()}`} 
          label="Owed by Customers" 
          icon="arrow-down-circle" 
          color={colors.success}
          invoiceValue={`₹${recInvoice.toLocaleString()}`}
          cashValue={`₹${recCash.toLocaleString()}`}
        />
        {user?.role !== 'agent' && (
          <FinancialSummaryCard 
            title="TOTAL PAYABLES" 
            value={`₹${(payInvoice + payCash).toLocaleString()}`} 
            label="Owed to Vendors" 
            icon="arrow-up-circle" 
            color={colors.warning}
            invoiceValue={`₹${payInvoice.toLocaleString()}`}
            cashValue={`₹${payCash.toLocaleString()}`}
          />
        )}
        {user?.role !== 'agent' && (
          <FinancialSummaryCard 
            title="ASSET VALUE" 
            value={`₹${assetValue.toLocaleString()}`} 
            label="Warehouse Stock Value" 
            icon="cube" 
            color={colors.primary}
            invoiceValue={`₹${assetInvoice.toLocaleString()}`}
            cashValue={`₹${assetCash.toLocaleString()}`}
          />
        )}
        {user?.role !== 'agent' && (
          <FinancialSummaryCard 
            title="PROFIT & LOSS" 
            value={`₹${(totalRevenue - totalCOGS).toLocaleString()}`} 
            label={`Margin: ${totalRevenue ? (((totalRevenue - totalCOGS) / totalRevenue) * 100).toFixed(1) : 0}%`} 
            icon="trending-up" 
            color={colors.purple} 
            invoiceValue={`Rev: ₹${totalRevenue.toLocaleString()}`}
            cashValue={`Cost: ₹${totalCOGS.toLocaleString()}`}
          />
        )}
      </View>

      <View style={styles.chartsFeedRow}>
        {user?.role !== 'agent' && (
          <View style={styles.chartWrapper}>
            <MonthlySalesWidget width={chartWidth} sales={allSales} challans={allChallans} />
          </View>
        )}
        <View style={styles.feedWrapper}>
          <LowStockAlerts products={lowStockProds} />
        </View>
      </View>


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
