import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { useTheme, useStyles } from '../utils/themeContext';
import { usePermission } from '../utils/permissions';
import { LightColors, Spacing, Radius } from '../constants/theme';
import { authStorage } from '../utils/storage';

const SIDEBAR_EXPANDED_KEY = 'vp_sidebar_expanded';

export const SIDEBAR_WIDTH = 230;

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
    label: 'Sales & Store',
    icon: 'trending-up-outline',
    items: [
      { label: 'Customers', route: 'parties/customers', icon: 'people-outline', activeIcon: 'people' },
      { label: 'Leads', route: 'leads', icon: 'git-branch-outline', activeIcon: 'git-branch' },
      { label: 'Orders & Web Queries', route: 'orders', icon: 'cart-outline', activeIcon: 'cart' },
      { label: 'Quotations', route: 'quotations', icon: 'document-text-outline', activeIcon: 'document-text' },
      { label: 'Delivery Challan & Dispatch', route: 'stockmovements', icon: 'bus-outline', activeIcon: 'bus', permission: 'stockmovement:view' },
      { label: 'Sales Invoices', route: 'invoices/sale', icon: 'receipt-outline', activeIcon: 'receipt' },
      { label: 'Medical Reps & Targets', route: 'medicalreps', icon: 'briefcase-outline', activeIcon: 'briefcase', permission: 'mr:view' },
      { label: 'Campaigns', route: 'campaigns', icon: 'megaphone-outline', activeIcon: 'megaphone', permission: 'campaign:view' },
    ],
  },
  {
    key: 'purchases',
    label: 'Purchase & Vendors',
    icon: 'bag-handle-outline',
    items: [
      { label: 'Vendors', route: 'parties/vendors', icon: 'storefront-outline', activeIcon: 'storefront' },
      { label: 'Purchase Invoices', route: 'invoices/purchase', icon: 'download-outline', activeIcon: 'download', permission: 'invoice:view' },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory & Production',
    icon: 'cube-outline',
    items: [
      { label: 'Products & Pricing', route: 'products', icon: 'cube-outline', activeIcon: 'cube' },
      { label: 'Inventories & Warehouses', route: 'inventories', icon: 'home-outline', activeIcon: 'home' },
      { label: 'Manufacturing & BMR', route: 'manufacturing', icon: 'hammer-outline', activeIcon: 'hammer' },
    ],
  },
  {
    key: 'finance',
    label: 'Finance & Accounting',
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
  return (
    <TouchableOpacity
      style={[styles.groupHeader, expanded && styles.groupHeaderExpanded]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={styles.groupHeaderLeft}>
        <View style={[styles.groupIconBox, expanded && styles.groupIconBoxExpanded]}>
          <Ionicons
            name={(expanded ? group.icon.replace('-outline', '') : group.icon) as any}
            size={16}
            color={expanded ? colors.primary : colors.text.secondary}
          />
        </View>
        <Text style={[styles.groupLabel, expanded && styles.groupLabelExpanded]}>
          {group.label}
        </Text>
      </View>
      <Ionicons
        name={expanded ? 'chevron-down' : 'chevron-forward'}
        size={14}
        color={colors.text.muted}
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
  return (
    <TouchableOpacity
      style={[styles.navItem, isActive && styles.navItemActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {isActive && <View style={styles.activeBar} />}
      <Ionicons
        name={isActive ? item.activeIcon : item.icon}
        size={16}
        color={isActive ? colors.primary : colors.text.secondary}
      />
      <Text style={[styles.navItemText, isActive && styles.navItemTextActive]}>
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
      backgroundColor: colors.primary + '08',
    },
    groupHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    groupIconBox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg.primary,
    },
    groupIconBoxExpanded: {
      backgroundColor: colors.primary + '15',
    },
    groupLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text.muted,
      marginLeft: 6,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    groupLabelExpanded: {
      color: colors.primary,
    },

    // ── Child Items ──
    childGroup: {
      paddingLeft: 4,
      marginLeft: Spacing.md + 16,
      gap: 1,
      marginBottom: 4,
      marginTop: 2,
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: Radius.sm,
      position: 'relative',
    },
    navItemActive: {
      backgroundColor: colors.primaryLight,
    },
    navItemText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.text.secondary,
      marginLeft: 8,
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
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
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
      fontSize: 10,
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

  const routeIncludes = (...segments: string[]) =>
    segments.some((s) => pathname.includes(s));

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const g of NAV_GROUPS) {
      map[g.key] = true;
    }
    return map;
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
    setExpandedGroups((prev) => {
      const next = { ...prev };
      for (const g of NAV_GROUPS) {
        if (routeIncludes(...g.items.map((i) => i.route.split('/')[0]))) {
          next[g.key] = true;
        }
      }
      return next;
    });
  }, [pathname]);

  const toggleGroup = (key: string) =>
    setExpandedGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
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
        <TouchableOpacity
          style={[styles.dashboardItem, isActive('index') && styles.dashboardItemActive]}
          onPress={() => navigate('index')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isActive('index') ? 'grid' : 'grid-outline'}
            size={18}
            color={isActive('index') ? colors.primary : colors.text.secondary}
          />
          <Text
            style={[styles.dashboardText, isActive('index') && styles.dashboardTextActive]}
          >
            Dashboard
          </Text>
          {isActive('index') && <View style={styles.dashboardActiveBar} />}
        </TouchableOpacity>

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
