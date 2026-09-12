import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { useTheme, useStyles } from '../utils/themeContext';
import { usePermission } from '../utils/permissions';
import { LightColors, Spacing, Radius } from '../constants/theme';
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

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'sales',
    label: 'Sales',
    icon: 'trending-up-outline',
    items: [
      { label: 'Customers', route: 'parties/customers', icon: 'people-outline', activeIcon: 'people' },
      { label: 'Leads', route: 'leads', icon: 'git-branch-outline', activeIcon: 'git-branch' },
      { label: 'Orders & Web Queries', route: 'orders', icon: 'cart-outline', activeIcon: 'cart' },
      { label: 'Sales Workspace', route: 'sales-workspace', icon: 'options-outline', activeIcon: 'options' },
      { label: 'Sales Intelligence', route: 'sales-intelligence', icon: 'flash-outline', activeIcon: 'flash' },
      { label: 'Quotations', route: 'quotations', icon: 'document-text-outline', activeIcon: 'document-text' },
      { label: 'Delivery Challan & Dispatch', route: 'stockmovements', icon: 'bus-outline', activeIcon: 'bus', permission: 'stockmovement:view' },
      { label: 'Sales Invoices', route: 'invoices/sale', icon: 'receipt-outline', activeIcon: 'receipt' },
      { label: 'Medical Reps & Targets', route: 'medicalreps', icon: 'briefcase-outline', activeIcon: 'briefcase', permission: 'mr:view' },
      { label: 'MR My Day', route: 'mr-my-day', icon: 'today-outline', activeIcon: 'today', permission: 'mr:view' },
      { label: 'Doctor Directory', route: 'doctors', icon: 'medkit-outline', activeIcon: 'medkit', permission: 'mr:view' },
      { label: 'Campaigns', route: 'campaigns', icon: 'megaphone-outline', activeIcon: 'megaphone', permission: 'campaign:view' },
    ],
  },
  {
    key: 'purchases',
    label: 'Purchasing',
    icon: 'bag-handle-outline',
    items: [
      { label: 'Vendors', route: 'parties/vendors', icon: 'storefront-outline', activeIcon: 'storefront' },
      { label: 'Purchase Invoices', route: 'invoices/purchase', icon: 'download-outline', activeIcon: 'download', permission: 'invoice:view' },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    icon: 'cube-outline',
    items: [
      { label: 'Products & Pricing', route: 'products', icon: 'cube-outline', activeIcon: 'cube' },
      { label: 'Inventories & Warehouses', route: 'inventories', icon: 'home-outline', activeIcon: 'home' },
      { label: 'Manufacturing & BMR', route: 'manufacturing', icon: 'hammer-outline', activeIcon: 'hammer' },
      { label: 'GMP & AYUSH Compliance', route: 'compliance', icon: 'shield-checkmark-outline', activeIcon: 'shield-checkmark', permission: 'quality:view' },
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
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: 'bar-chart-outline',
    items: [
      { label: 'Reports & Audits', route: 'reports', icon: 'bar-chart-outline', activeIcon: 'bar-chart', permission: 'report:view' },
    ],
  },
  {
    key: 'administration',
    label: 'Admin',
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
      {isActive && <View style={styles.dashboardActiveBar} />}
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
        <View style={[styles.groupIconBox, (expanded || hovered) && styles.groupIconBoxExpanded]}>
          <Ionicons
            name={(expanded ? group.icon.replace('-outline', '') : group.icon) as any}
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
      {isActive && <View style={styles.activeBar} />}
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
      paddingVertical: 9,
      paddingHorizontal: Spacing.sm,
      marginHorizontal: Spacing.xs,
      borderRadius: Radius.md,
      marginBottom: 4,
    },
    dashboardItemActive: {
      backgroundColor: colors.primaryLight,
    },
    dashboardText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.secondary,
      marginLeft: 10,
    },
    dashboardTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    dashboardActiveBar: {
      position: 'absolute',
      left: 0,
      top: 8,
      bottom: 8,
      width: 3,
      borderRadius: 2,
      backgroundColor: colors.primary,
    },

    // ── Group Headers ──
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      paddingHorizontal: Spacing.sm,
      marginHorizontal: Spacing.xs,
      borderRadius: Radius.md,
      marginTop: 2,
    },
    groupHeaderExpanded: {
      backgroundColor: colors.primaryLight,
    },
    groupHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    groupIconBox: {
      width: 24,
      height: 24,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg.primary,
    },
    groupIconBoxExpanded: {
      backgroundColor: colors.primaryLight,
    },
    groupLabel: {
      fontSize: 10.5,
      fontWeight: '700',
      color: colors.text.muted,
      marginLeft: 8,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    groupLabelExpanded: {
      color: colors.primary,
    },

    // Hover effect style
    itemHovered: {
      backgroundColor: colors.primaryLight,
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
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderRadius: Radius.md,
      position: 'relative',
      overflow: 'hidden',
    },
    navItemActive: {
      backgroundColor: colors.primaryLight,
    },
    navItemText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.text.secondary,
      marginLeft: 8,
      flex: 1,
      flexShrink: 1,
    },
    navItemTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    activeBar: {
      position: 'absolute',
      left: 0,
      top: 6,
      bottom: 6,
      width: 3,
      borderRadius: 2,
      backgroundColor: colors.primary,
    },

    // ── Footer Controls ──
    footer: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.sm,
      gap: 6,
    },
    footerIconBtn: {
      flex: 1,
      height: 34,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg.primary,
    },
    footerLogoutIconBtn: {
      flex: 1,
      height: 34,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.danger + '30',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.danger + '10',
    },
    statusBadge: {
      flex: 1,
      height: 34,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      paddingHorizontal: 6,
      borderRadius: 6,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    badgeText: {
      fontSize: 10.5,
      fontWeight: '700',
      marginLeft: 6,
    },
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%' }}>
          {/* 1. Connection status */}
          <View style={[styles.statusBadge, { backgroundColor: isOnline ? colors.successLight : colors.warningLight, borderColor: isOnline ? colors.success : colors.warning }]}>
            <View style={[styles.dot, { backgroundColor: isOnline ? colors.success : colors.warning }]} />
            <Text style={[styles.badgeText, { color: isOnline ? colors.success : colors.warning }]}>
              {isOnline ? 'Synced' : 'Local'}
            </Text>
          </View>

          {/* 2. Theme Toggle Icon */}
          <TouchableOpacity onPress={toggleTheme} style={styles.footerIconBtn} activeOpacity={0.7}>
            <Ionicons name={themeMode === 'dark' ? 'sunny-outline' : 'moon-outline'} size={17} color={colors.text.secondary} />
          </TouchableOpacity>

          {/* 3. Logout Icon */}
          {logout && (
            <TouchableOpacity onPress={logout} style={styles.footerLogoutIconBtn} activeOpacity={0.7}>
              <Ionicons name="log-out-outline" size={17} color={colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

export default Sidebar;
