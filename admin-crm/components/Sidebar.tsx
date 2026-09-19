import { PressableOpacity as TouchableOpacity } from './PressableOpacity';
import { AppText as Text } from './AppText';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { useTheme, useStyles } from '../utils/themeContext';
import { usePermission } from '../utils/permissions';
import { LightColors, Spacing, Radius, Typography, ControlHeight } from '../constants/theme';
import { authStorage } from '../utils/storage';

const SIDEBAR_EXPANDED_KEY = 'vp_sidebar_expanded_v2';

export const SIDEBAR_WIDTH = 224;

type NavGroup = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  items: NavItem[];
};

type NavItem = {
  label: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  permission?: string;
};

const FREQUENT_ITEMS: NavItem[] = [
  { label: 'Customers', route: 'parties/customers', icon: 'people-outline', activeIcon: 'people' },
  { label: 'Products', route: 'products', icon: 'cube-outline', activeIcon: 'cube' },
  { label: 'Payments', route: 'payments', icon: 'cash-outline', activeIcon: 'cash' },
  { label: 'Sales Invoices', route: 'invoices/sale', icon: 'receipt-outline', activeIcon: 'receipt' },
  { label: 'MR My Day', route: 'mr-my-day', icon: 'today-outline', activeIcon: 'today', permission: 'mr:view' },
];

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'sales',
    label: 'Sales & Orders',
    icon: 'cart-outline',
    items: [
      { label: 'Orders', route: 'orders', icon: 'globe-outline', activeIcon: 'globe' },
      { label: 'Quotations', route: 'quotations', icon: 'document-text-outline', activeIcon: 'document-text' },
      { label: 'Sales Invoices', route: 'invoices/sale', icon: 'receipt-outline', activeIcon: 'receipt' },
      { label: 'Sales Workspace', route: 'sales-workspace', icon: 'options-outline', activeIcon: 'options' },
      { label: 'Sales Intelligence', route: 'sales-intelligence', icon: 'flash-outline', activeIcon: 'flash' },
    ],
  },
  {
    key: 'field-team',
    label: 'Customers & Field Team',
    icon: 'people-outline',
    items: [
      { label: 'Customers', route: 'parties/customers', icon: 'people-outline', activeIcon: 'people' },
      { label: 'Leads', route: 'leads', icon: 'git-branch-outline', activeIcon: 'git-branch' },
      { label: 'Medical Representatives', route: 'medicalreps', icon: 'briefcase-outline', activeIcon: 'briefcase', permission: 'mr:view' },
      { label: 'MR My Day', route: 'mr-my-day', icon: 'today-outline', activeIcon: 'today', permission: 'mr:view' },
      { label: 'Doctor Directory', route: 'doctors', icon: 'medkit-outline', activeIcon: 'medkit', permission: 'mr:view' },
      { label: 'Campaigns', route: 'campaigns', icon: 'megaphone-outline', activeIcon: 'megaphone', permission: 'campaign:view' },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory & Mfg.',
    icon: 'cube-outline',
    items: [
      { label: 'Products', route: 'products', icon: 'pricetag-outline', activeIcon: 'pricetag' },
      { label: 'Inventories & Warehouses', route: 'inventories', icon: 'home-outline', activeIcon: 'home' },
      { label: 'Delivery Challans', route: 'stockmovements', icon: 'swap-horizontal-outline', activeIcon: 'swap-horizontal', permission: 'stockmovement:view' },
      { label: 'Manufacturing & BMR', route: 'manufacturing', icon: 'hammer-outline', activeIcon: 'hammer' },
      { label: 'Inventory Reconciliation', route: 'inventory-reconciliation', icon: 'git-compare-outline', activeIcon: 'git-compare', permission: 'inventory:view' },
      { label: 'GMP & Compliance', route: 'compliance', icon: 'shield-checkmark-outline', activeIcon: 'shield-checkmark', permission: 'quality:view' },
    ],
  },
  {
    key: 'purchasing',
    label: 'Purchasing',
    icon: 'bag-handle-outline',
    items: [
      { label: 'Vendors', route: 'parties/vendors', icon: 'storefront-outline', activeIcon: 'storefront' },
      { label: 'Purchase Invoices', route: 'invoices/purchase', icon: 'download-outline', activeIcon: 'download', permission: 'invoice:view' },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: 'cash-outline',
    items: [
      { label: 'Payments', route: 'payments', icon: 'cash-outline', activeIcon: 'cash' },
      { label: 'Receivable Ageing', route: 'ageing', icon: 'hourglass-outline', activeIcon: 'hourglass' },
      { label: 'Credit / Debit Notes', route: 'credit-notes', icon: 'swap-horizontal-outline', activeIcon: 'swap-horizontal' },
      { label: 'GST Returns', route: 'gst-returns', icon: 'document-attach-outline', activeIcon: 'document-attach', permission: 'report:view' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: 'bar-chart-outline',
    items: [
      { label: 'Reports', route: 'reports', icon: 'bar-chart-outline', activeIcon: 'bar-chart', permission: 'report:view' },
    ],
  },
  {
    key: 'administration',
    label: 'Administration',
    icon: 'settings-outline',
    items: [
      { label: 'AI Business Assistant', route: 'ai-analytics', icon: 'sparkles-outline', activeIcon: 'sparkles' },
      { label: 'Access Control', route: 'rbac', icon: 'shield-checkmark-outline', activeIcon: 'shield-checkmark', permission: 'rbac:manage' },
      { label: 'My Details', route: 'profile', icon: 'person-outline', activeIcon: 'person' },
      { label: 'System Audit Logs', route: 'audit', icon: 'shield-outline', activeIcon: 'shield', permission: 'audit:view' },
    ],
  },
];

function DashboardItem({
  isActive,
  onPress,
  colors,
  styles,
}: {
  isActive: boolean;
  onPress: () => void;
  colors: typeof LightColors;
  styles: ReturnType<typeof createSidebarStyles>;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <TouchableOpacity
      style={[
        styles.dashboardItem,
        isActive && styles.dashboardItemActive,
        !isActive && hovered && styles.itemHovered,
      ]}
      onPress={onPress}
      activeOpacity={0.75}
      // @ts-ignore
      onMouseEnter={() => setHovered(true)}
      // @ts-ignore
      onMouseLeave={() => setHovered(false)}
    >
      <Ionicons
        name={isActive ? 'grid' : 'grid-outline'}
        size={18}
        color={isActive || hovered ? colors.primary : colors.text.secondary}
      />
      <Text style={[styles.dashboardText, (isActive || hovered) && styles.dashboardTextActive]}>
        Dashboard
      </Text>
    </TouchableOpacity>
  );
}

function GroupHeader({
  group,
  expanded,
  onToggle,
  colors,
  styles,
}: {
  group: NavGroup;
  expanded: boolean;
  onToggle: () => void;
  colors: typeof LightColors;
  styles: ReturnType<typeof createSidebarStyles>;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <TouchableOpacity
      style={[
        styles.groupHeader,
        expanded && styles.groupHeaderExpanded,
        !expanded && hovered && styles.itemHovered,
      ]}
      onPress={onToggle}
      activeOpacity={0.75}
      // @ts-ignore
      onMouseEnter={() => setHovered(true)}
      // @ts-ignore
      onMouseLeave={() => setHovered(false)}
    >
      <View style={styles.groupHeaderLeft}>
        <View style={styles.groupIconBox}>
          <Ionicons
            name={(expanded ? group.icon.toString().replace('-outline', '') : group.icon) as any}
            size={16}
            color={expanded || hovered ? colors.primary : colors.text.secondary}
          />
        </View>
        <Text style={[styles.groupLabel, (expanded || hovered) && styles.groupLabelExpanded]}>
          {group.label}
        </Text>
      </View>
      <Ionicons
        name={expanded ? 'chevron-down' : 'chevron-forward'}
        size={14}
        color={expanded || hovered ? colors.primary : colors.text.muted}
      />
    </TouchableOpacity>
  );
}

function NavItemRow({
  item,
  isActive,
  onPress,
  colors,
  styles,
}: {
  item: NavItem;
  isActive: boolean;
  onPress: () => void;
  colors: typeof LightColors;
  styles: ReturnType<typeof createSidebarStyles>;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <TouchableOpacity
      style={[
        styles.navItem,
        isActive && styles.navItemActive,
        !isActive && hovered && styles.itemHovered,
      ]}
      onPress={onPress}
      activeOpacity={0.75}
      // @ts-ignore
      onMouseEnter={() => setHovered(true)}
      // @ts-ignore
      onMouseLeave={() => setHovered(false)}
    >
      <Ionicons
        name={isActive ? item.activeIcon : item.icon}
        size={16}
        color={isActive || hovered ? colors.primary : colors.text.secondary}
      />
      <Text
        style={[styles.navItemText, (isActive || hovered) && styles.navItemTextActive]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {item.label}
      </Text>
    </TouchableOpacity>
  );
}

const createSidebarStyles = (colors: typeof LightColors) =>
  StyleSheet.create({
    sidebar: {
      width: '100%',
      backgroundColor: colors.bg.secondary,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      height: '100%',
      flexDirection: 'column',
    },
    scrollContent: {
      paddingTop: 12,
      paddingBottom: Spacing.sm,
      flexGrow: 1,
    },

    dashboardItem: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: ControlHeight.buttonMd,
      paddingVertical: 10,
      paddingHorizontal: Spacing.sm,
      marginHorizontal: Spacing.xs,
      borderRadius: Radius.md,
      marginBottom: 4,
    },
    dashboardItemActive: {
      backgroundColor: colors.primaryLight,
    },
    dashboardText: { ...Typography.bodySm, fontWeight: '600', color: colors.text.secondary, marginLeft: 10 },
    dashboardTextActive: {
      color: colors.text.primary,
      fontWeight: '700',
    },
    // ── Group Headers ──
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: ControlHeight.buttonMd,
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: Spacing.sm,
      marginHorizontal: Spacing.xs,
      borderRadius: Radius.md,
      marginTop: 2,
    },
    groupHeaderExpanded: {
      backgroundColor: 'transparent',
    },
    groupHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    groupIconBox: {
      width: 24,
      height: 24,
      borderRadius: Radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    groupIconBoxExpanded: { backgroundColor: 'transparent' },
    groupLabel: { ...Typography.caption, fontWeight: '600', color: colors.text.muted, marginLeft: 8 },
    groupLabelExpanded: {
      color: colors.text.primary,
    },

    // Hover effect style
    itemHovered: {
      backgroundColor: colors.bg.cardHover,
    },

    // ── Child Items ──
    childGroup: {
      paddingLeft: 2,
      marginLeft: 12,
      marginRight: Spacing.xs,
      gap: 1,
      marginBottom: 4,
      marginTop: 2,
      overflow: 'hidden',
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: ControlHeight.buttonMd,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: Radius.md,
      position: 'relative',
      overflow: 'hidden',
    },
    navItemActive: {
      backgroundColor: colors.primaryLight,
    },
    navItemText: { ...Typography.bodySm, fontWeight: '600', color: colors.text.secondary, marginLeft: 8, flex: 1, flexShrink: 1 },
    navItemTextActive: {
      color: colors.text.primary,
      fontWeight: '700',
    },
    // ── Footer Controls ──
    footer: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.md,
    },
    footerIconBtn: {
      flex: 1,
      height: 40,
      borderRadius: 8,
      borderWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    footerLogoutIconBtn: {
      flex: 1,
      height: 40,
      borderRadius: 8,
      borderWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    statusBadge: {
      flex: 1.5,
      height: 40,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
      paddingHorizontal: 6,
      borderRadius: 8,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    badgeText: { ...Typography.caption, fontWeight: '600', marginLeft: 6 },
    quickAccessLabel: { marginBottom: 6, marginLeft: 12 },
  });

function Sidebar({ onNavigate, isOnline, logout }: { onNavigate?: () => void; isOnline?: boolean; logout?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { colors, themeMode, toggleTheme } = useTheme();
  const perm = usePermission();
  const styles = useStyles(createSidebarStyles);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    return Object.fromEntries(NAV_GROUPS.map((g) => [g.key, false])) as Record<string, boolean>;
  });
  const loadedRef = useRef(false);

  useEffect(() => {
    authStorage.getItem(SIDEBAR_EXPANDED_KEY).then((val) => {
      if (val) {
        try {
          const saved = JSON.parse(val);
          setExpandedGroups((prev) => ({ ...prev, ...saved }));
        } catch {}
      }
      loadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    const activeGroup = NAV_GROUPS.find((g) =>
      g.items.some((i) => pathname.startsWith(`/${i.route}`))
    );
    if (!activeGroup) return;
    setExpandedGroups((prev) => {
      const next = Object.fromEntries(
        NAV_GROUPS.map((g) => [g.key, g.key === activeGroup.key])
      ) as Record<string, boolean>;
      if (loadedRef.current) authStorage.setItem(SIDEBAR_EXPANDED_KEY, JSON.stringify(next));
      return next;
    });
  }, [pathname]);

  const toggleGroup = (key: string) =>
    setExpandedGroups((prev) => {
      const willOpen = !prev[key];
      const next = Object.fromEntries(
        NAV_GROUPS.map((g) => [g.key, willOpen && g.key === key])
      ) as Record<string, boolean>;
      authStorage.setItem(SIDEBAR_EXPANDED_KEY, JSON.stringify(next));
      return next;
    });

  const isActive = (route: string) => {
    if (route === 'index') return pathname === '/';
    return pathname.startsWith(`/${route}`);
  };

  const navigate = (route: string) => {
    router.push(route === 'index' ? '/' : `/${route}`);
    if (onNavigate) onNavigate();
  };

  return (
    <View style={styles.sidebar}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={{ flex: 1 }}
        bounces={false}
      >
        {/* Dashboard */}
        <DashboardItem
          isActive={isActive('index')}
          onPress={() => navigate('index')}
          colors={colors}
          styles={styles}
        />

        {/* Frequent Items */}
        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.groupLabel, styles.quickAccessLabel]}>Quick access</Text>
          {FREQUENT_ITEMS.map((item) => {
            if (item.permission && !perm.can(item.permission)) return null;
            return (
              <NavItemRow
                key={`freq-${item.route}`}
                item={item}
                isActive={isActive(item.route)}
                onPress={() => navigate(item.route)}
                colors={colors}
                styles={styles}
              />
            );
          })}
        </View>

        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8, marginHorizontal: Spacing.sm }} />

        {/* Nav Groups */}
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.permission || perm.can(item.permission)
          );
          if (visibleItems.length === 0) return null;

          const expanded = expandedGroups[group.key] ?? false;

          return (
            <View key={group.key}>
              <GroupHeader
                group={group}
                expanded={expanded}
                onToggle={() => toggleGroup(group.key)}
                colors={colors}
                styles={styles}
              />

              {expanded && (
                <View style={styles.childGroup}>
                  {visibleItems.map((item) => (
                    <NavItemRow
                      key={item.route}
                      item={item}
                      isActive={isActive(item.route)}
                      onPress={() => navigate(item.route)}
                      colors={colors}
                      styles={styles}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Footer Controls */}
      <View style={styles.footer}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%' }}>
          {/* 1. Connection status */}
          <View style={[styles.statusBadge, { backgroundColor: isOnline ? colors.successLight : colors.warningLight, borderColor: isOnline ? colors.success : colors.warning }]}>
            <View style={[styles.dot, { backgroundColor: isOnline ? colors.success : colors.warning }]} />
            <Text style={[styles.badgeText, { color: isOnline ? colors.success : colors.warning }]}>
              {isOnline ? 'Synced' : 'Local'}
            </Text>
          </View>

          {/* 2. Theme Toggle Icon */}
          <TouchableOpacity onPress={toggleTheme} style={styles.footerIconBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={themeMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            <Ionicons name={themeMode === 'dark' ? 'sunny-outline' : 'moon-outline'} size={17} color={colors.text.secondary} />
          </TouchableOpacity>

          {/* 3. Logout Icon */}
          {logout && (
            <TouchableOpacity onPress={logout} style={styles.footerLogoutIconBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Log out">
              <Ionicons name="log-out-outline" size={17} color={colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

export default Sidebar;
