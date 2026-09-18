import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusPill } from './../components/WorkspacePrimitives';
import { PressableOpacity as TouchableOpacity } from './../components/PressableOpacity';
import { AppText as Text } from './../components/AppText';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, Spacing, Radius, Shadows, Typography, ControlHeight } from '../constants/theme';
import { View, StyleSheet, ActivityIndicator, useWindowDimensions, Modal, Pressable, ScrollView, Image, DeviceEventEmitter, Platform } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { api, API_BASE } from '../utils/api';
import { AuthProvider, useAuth } from '../utils/auth';
import { usePermission } from '../utils/permissions';
import { ThemeProvider, useTheme, useStyles } from '../utils/themeContext';
import { ToastProvider } from '../utils/ToastContext';
import { ConfirmProvider } from '../utils/ConfirmContext';
import LoginScreen from './login';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Sidebar, { SIDEBAR_WIDTH } from '../components/Sidebar';
import AyurvedicLoader from '../components/AyurvedicLoader';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { getSocket } from '../utils/socket';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { GlobalSearchModal } from '../components/GlobalSearchModal';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function TopHeader({ user, isOnline, logout, toggleSidebar }: { user: any; isOnline: boolean; logout: () => void; toggleSidebar?: () => void }) {
  const { themeMode, toggleTheme, colors } = useTheme();
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  const ROUTE_TITLE_MAP: [string, string][] = [
    ['/parties/customers', 'Customers'],
    ['/parties/vendors', 'Vendors'],
    ['/invoices/sale', 'Sales Invoices'],
    ['/invoices/purchase', 'Purchase Invoices'],
    ['/products', 'Products'],
    ['/inventories', 'Inventories & Warehouses'],
    ['/inventory-reconciliation', 'Inventory Reconciliation'],
    ['/leads', 'Leads'],
    ['/queries', 'Web Queries'],
    ['/orders', 'Orders'],
    ['/quotations', 'Quotations'],
    ['/payments', 'Payments'],
    ['/ageing', 'Receivable Ageing'],
    ['/reports', 'Reports'],
    ['/rbac', 'Access Control'],
    ['/audit', 'System Audit Logs'],
    ['/manufacturing', 'Manufacturing & BMR'],
    ['/stockmovements', 'Delivery Challans'],
    ['/profile', 'My Details'],
    ['/campaigns', 'Campaigns'],
    ['/ai-analytics', 'AI Business Assistant'],
    ['/credit-notes', 'Credit / Debit Notes'],
    ['/gst-returns', 'GST Returns'],
    ['/medicalreps', 'Medical Representatives'],
    ['/doctors', 'Doctor Directory'],
    ['/sales-workspace', 'Sales Workspace'],
    ['/sales-intelligence', 'Sales Intelligence'],
    ['/mr-my-day', 'MR My Day'],
    ['/compliance', 'GMP & Compliance'],
  ];

  const getPageName = (path: string) => {
    if (path === '/' || path === '') return 'Dashboard';
    for (let i = 0; i < ROUTE_TITLE_MAP.length; i++) {
      const [prefix, title] = ROUTE_TITLE_MAP[i];
      if (path.startsWith(prefix)) return title;
    }
    return '';
  };

  const pageName = getPageName(pathname);

  const roleColors: { [key: string]: string } = {
    admin: colors.danger,
    manager: colors.warning,
    agent: colors.success
  };

  return (
    <View style={[
      styles.topHeader, 
      { 
        paddingLeft: isDesktop ? 0 : Spacing.lg,
        paddingTop: isDesktop ? 0 : insets.top,
        height: isDesktop ? 64 : 64 + insets.top
      }
    ]}>
      {/* Left section: Logo & Page Name */}
      <View style={{ flexDirection: 'row', alignItems: 'center', height: '100%', flex: 1 }}>
        <View style={[
          styles.headerBrand,
          {
            width: isDesktop ? 240 : 'auto',
            justifyContent: isDesktop ? 'center' : 'flex-start',
            paddingHorizontal: isDesktop ? 16 : 0,
            height: '100%',
          }
        ]}>
          {!isDesktop && toggleSidebar && (
            <TouchableOpacity onPress={toggleSidebar} style={styles.hamburgerBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Open navigation menu">
              <Ionicons name="menu-outline" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            onPress={() => router.push('/')} 
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <Image 
              source={require('../assets/logo.png')} 
              style={{ width: 36, height: 36, borderRadius: 4 }}
              resizeMode="contain"
            />
            {!isDesktop && pageName ? (
              <Text style={{ ...Typography.h3, color: colors.text.primary, maxWidth: 150 }} numberOfLines={1}>
                {pageName}
              </Text>
            ) : null}
            {isDesktop && (
              <View style={{ flexDirection: 'column', justifyContent: 'center' }}>
                <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.text.primary }}>
                  SHEKHAR BANDHU
                </Text>
                <Text style={{ ...Typography.eyebrow, fontWeight: '700', color: colors.primary, marginTop: 1 }}>
                  AUSHADHALAYA
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {isDesktop && pageName ? (
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={{ ...Typography.h3, fontWeight: '700', color: colors.text.primary }}>
              {pageName}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Right Controls */}
      <View style={styles.headerControls}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => DeviceEventEmitter.emit('open_global_search')} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Global search">
          <Ionicons name="search" size={18} color={colors.text.secondary} />
        </TouchableOpacity>

        {/* User Card */}
        <TouchableOpacity style={styles.headerUser} onPress={() => router.push('/profile')} activeOpacity={0.7}>
          <View style={[styles.headerAvatar, { borderColor: roleColors[user.role] || colors.text.muted }]}>
            <Text style={styles.headerAvatarText}>{user.name.charAt(0)}</Text>
          </View>
          {isDesktop && (
            <View style={styles.headerUserInfo}>
              <Text style={styles.headerUserName} numberOfLines={1}>{user.name}</Text>
              <StatusPill  label={<>
                  {user.role.toUpperCase()}
                </>} textStyle={[styles.roleText, { color: roleColors[user.role] || colors.text.muted }]} />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Sidebar extracted to components/Sidebar.tsx

type MobileTabConfig = { name: string; label: string; outline: string; filled: string; permission?: string };
const MOBILE_TAB_CONFIG: readonly MobileTabConfig[] = [
  { name: 'index', label: 'Dashboard', outline: 'grid-outline', filled: 'grid' },
  { name: 'orders', label: 'Orders', outline: 'cart-outline', filled: 'cart' },
  { name: 'sales-workspace', label: 'Sales', outline: 'options-outline', filled: 'options' },
  { name: 'mr-my-day', label: 'My Day', outline: 'today-outline', filled: 'today', permission: 'mr:view' },
] as const;

function MobileTabBar({ state, navigation, onMore, permissions }: any) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const can = (permission?: string) => !permission || (permissions && (permissions.includes('*') || permissions.includes(permission)));
  const visibleTabs = MOBILE_TAB_CONFIG.filter((tab) => can(tab.permission));

  return (
    <View style={[styles.mobileTabBar, { height: 56 + insets.bottom, paddingBottom: insets.bottom }]}> 
      {visibleTabs.map((tab) => {
        const routeIndex = state.routes.findIndex((route: any) => route.name === tab.name);
        if (routeIndex < 0) return null;
        const route = state.routes[routeIndex];
        const focused = state.index === routeIndex;
        const descriptor = state.routes[routeIndex] ? state.routes[routeIndex].key : route.key;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: descriptor, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.mobileTabItem}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: focused }}
          >
            <Ionicons name={(focused ? tab.filled : tab.outline) as any} size={21} color={focused ? colors.primary : colors.text.secondary} />
            <Text style={[styles.mobileTabLabel, { color: focused ? colors.primary : colors.text.secondary }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={styles.mobileTabItem}
        onPress={onMore}
        accessibilityRole="button"
        accessibilityLabel="More navigation"
      >
        <Ionicons name="ellipsis-horizontal-outline" size={21} color={colors.text.secondary} />
        <Text style={[styles.mobileTabLabel, { color: colors.text.secondary }]}>More</Text>
      </TouchableOpacity>
    </View>
  );
}

function MainLayout() {
  const { user, loading, logout } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDrawerMounted, setIsDrawerMounted] = useState(false);
  const drawerCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { themeMode, colors } = useTheme();
  const { permissions } = usePermission();
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  const [globalLoading, setGlobalLoading] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);

  useEffect(() => {
    const unsubscribeNetInfo = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected);
    });

    const sub = DeviceEventEmitter.addListener('global_loader', (data) => {
      setGlobalLoading(data.isLoading);
    });

    const authSub = DeviceEventEmitter.addListener('auth_error', () => {
      logout();
    });

    const forbiddenSub = DeviceEventEmitter.addListener('auth_forbidden', () => {
      alert('You do not have permission to perform this action.');
    });

    const searchSub = DeviceEventEmitter.addListener('open_global_search', () => {
      setIsSearchVisible(true);
    });

    // Initialize Socket.io real-time connection
    const socket = getSocket();

    // Define all socket events and their corresponding DeviceEventEmitter events
    const socketEvents = [
      // Manufacturing
      'mfg_stage_updated', 'mfg_batch_created', 'mfg_batch_completed', 'mfg_batch_cancelled',
      'qc_hold_alert', 'mfg_unit_updated', 'bom_updated', 'raw_material_updated',
      // Sales & Orders
      'order_updated', 'quotation_updated', 'customer_updated', 'vendor_updated',
      'pricing_updated', 'sales_target_updated',
      // Inventory & Warehouse
      'inventory_updated', 'product_updated', 'warehouse_updated', 'transfer_updated',
      'compliance_updated',
      // Invoices, Challans & Payments
      'invoice_updated', 'challan_updated', 'challan_created', 'payment_updated', 'credit_note_updated',
      'gst_return_updated',
      // CRM
      'contact_updated', 'medrep_updated', 'task_updated',
      // Operations
      'dispatch_updated', 'complaint_updated', 'sample_updated',
      'new_web_order',
      // Marketing
      'campaign_updated',
      // System
      'rbac_updated', 'settings_updated', 'notification_updated', 'query_updated',
    ];

    const socketEventCachePatterns: Record<string, string> = {
      mfg_stage_updated: 'batch-productions',
      mfg_batch_created: 'batch-productions',
      mfg_batch_completed: 'batch-productions',
      mfg_batch_cancelled: 'batch-productions',
      mfg_unit_updated: 'manufacturing-units',
      bom_updated: 'bom',
      raw_material_updated: 'raw-materials',
      order_updated: 'orders',
      quotation_updated: 'quotations',
      customer_updated: 'customers',
      vendor_updated: 'vendors',
      pricing_updated: 'pricing',
      sales_target_updated: 'sales-targets',
      inventory_updated: 'inventories',
      product_updated: 'products',
      warehouse_updated: 'warehouses',
      transfer_updated: 'transfers',
      compliance_updated: 'compliance',
      invoice_updated: 'invoices',
      challan_updated: 'challans',
      challan_created: 'challans',
      payment_updated: 'payments',
      credit_note_updated: 'credit-notes',
      gst_return_updated: 'gst',
      contact_updated: 'contacts',
      medrep_updated: 'medical-reps',
      task_updated: 'tasks',
      dispatch_updated: 'dispatches',
      complaint_updated: 'complaints',
      sample_updated: 'samples',
      new_web_order: 'orders',
      campaign_updated: 'campaigns',
      rbac_updated: 'rbac',
      settings_updated: 'settings',
      notification_updated: 'notifications',
      query_updated: 'queries',
    };

    socketEvents.forEach(eventName => {
      socket.on(eventName, (data) => {
        const pattern = socketEventCachePatterns[eventName];
        api.clearCache(pattern);
        DeviceEventEmitter.emit(`${eventName}_event`, data);
      });
    });

    return () => {
      unsubscribeNetInfo();
      sub.remove();
      authSub.remove();
      forbiddenSub.remove();
      searchSub.remove();
      if (drawerCloseTimer.current) clearTimeout(drawerCloseTimer.current);
      socketEvents.forEach(eventName => {
        socket.off(eventName);
      });
    };
  }, []);

  const openSidebar = () => {
    if (drawerCloseTimer.current) clearTimeout(drawerCloseTimer.current);
    setIsDrawerMounted(true);
    setIsSidebarOpen(true);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
    if (drawerCloseTimer.current) clearTimeout(drawerCloseTimer.current);
    drawerCloseTimer.current = setTimeout(() => setIsDrawerMounted(false), 220);
  };

  const drawerProgress = useSharedValue(0);
  useEffect(() => {
    drawerProgress.value = withTiming(isSidebarOpen ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [drawerProgress, isSidebarOpen]);
  const drawerPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - drawerProgress.value) * -SIDEBAR_WIDTH }],
  }));
  const drawerBackdropStyle = useAnimatedStyle(() => ({ opacity: drawerProgress.value }));

  if (loading) {
    return <AyurvedicLoader message="शेखर बंधु औषधालय में आपका स्वागत है" />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <View style={styles.wrapper}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      
      {globalLoading && (
        <Modal transparent visible={globalLoading} animationType="none">
          <View style={{
            flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
            justifyContent: 'center', alignItems: 'center',
            zIndex: 99999
          }}>
            <AyurvedicLoader />
          </View>
        </Modal>
      )}

      {/* Dynamic Top Header */}
      <TopHeader user={user} isOnline={isOnline} logout={logout} toggleSidebar={openSidebar} />
      
      <GlobalSearchModal visible={isSearchVisible} onClose={() => setIsSearchVisible(false)} />
      
      <View style={[styles.mainContainer, { flexDirection: isDesktop ? 'row' : 'column' }]}>
        {isDesktop && (
          <View style={{ width: SIDEBAR_WIDTH, height: '100%' }}>
            <Sidebar isOnline={isOnline} logout={logout} />
          </View>
        )}
        
        {/* Mobile Navigation Drawer Modal */}
        {!isDesktop && (
          <Modal
            transparent
            visible={isDrawerMounted}
            animationType="none"
            onRequestClose={closeSidebar}
          >
            <View style={styles.drawerOverlay}>
              <Animated.View style={[styles.drawerBackdrop, drawerBackdropStyle]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={closeSidebar} />
              </Animated.View>
              <Animated.View style={[styles.drawerContent, { paddingTop: insets.top }, drawerPanelStyle]}>
                <View style={styles.drawerHeader}>
                  <Text style={styles.drawerTitle} numberOfLines={1}>SHEKHAR BANDHU AUSHADHALAYA</Text>
                  <TouchableOpacity onPress={closeSidebar} style={styles.drawerCloseBtn} accessibilityRole="button" accessibilityLabel="Close navigation menu">
                    <Ionicons name="close" size={24} color={colors.text.primary} />
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Sidebar onNavigate={closeSidebar} isOnline={isOnline} logout={logout} />
                </View>
              </Animated.View>
            </View>
          </Modal>
        )}

        <View style={{ flex: 1 }}>
          <ErrorBoundary>
          <Tabs
            tabBar={(props) => isDesktop ? null : <MobileTabBar {...props} permissions={permissions} onMore={openSidebar} />}
            screenOptions={{
              headerShown: false,
              tabBarStyle: isDesktop ? { display: 'none' } : styles.mobileTabBar,
              tabBarShowLabel: true,
              tabBarActiveTintColor: colors.primary,
              tabBarInactiveTintColor: colors.text.secondary,
              tabBarLabelStyle: { ...Typography.caption, fontWeight: '600' },
              lazy: true,
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: 'Dashboard',
                tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={size} color={color} />,
              }}
            />
            <Tabs.Screen
              name="leads"
              options={{
                title: 'Leads',
                href: null,
                tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'git-branch' : 'git-branch-outline'} size={size} color={color} />,
              }}
            />
            <Tabs.Screen
              name="reports"
              options={{
                title: 'Reports',
                tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={size} color={color} />,
                href: null,
              }}
            />
            <Tabs.Screen name="parties/customers" options={{ href: null }} />
            <Tabs.Screen name="parties/vendors" options={{ href: null }} />
            <Tabs.Screen name="products" options={{ href: null }} />
            <Tabs.Screen name="compliance" options={{ href: null }} />
            <Tabs.Screen name="payments" options={{ href: null }} />
            <Tabs.Screen name="ageing" options={{ href: null }} />
            <Tabs.Screen name="credit-notes" options={{ href: null }} />
            <Tabs.Screen name="gst-returns" options={{ href: null }} />
            <Tabs.Screen name="inventories" options={{ href: null }} />
            <Tabs.Screen name="inventory-reconciliation" options={{ href: null }} />
            <Tabs.Screen name="inventorydispatch" options={{ href: null }} />
            <Tabs.Screen name="invoices/sale" options={{ href: null }} />
            <Tabs.Screen name="invoices/purchase" options={{ href: null }} />
            <Tabs.Screen name="contacts" options={{ href: null }} />
            <Tabs.Screen name="pipeline" options={{ href: null }} />
            <Tabs.Screen name="quotations" options={{ href: null }} />
            <Tabs.Screen name="login" options={{ href: null }} />
            <Tabs.Screen name="rbac" options={{ href: null }} />
            <Tabs.Screen name="audit" options={{ href: null }} />
            <Tabs.Screen name="queries" options={{ href: null }} />
            <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'cart' : 'cart-outline'} size={size} color={color} /> }} />
            <Tabs.Screen name="sales-workspace" options={{ title: 'Sales', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'options' : 'options-outline'} size={size} color={color} /> }} />
            <Tabs.Screen name="sales-intelligence" options={{ href: null }} />
            <Tabs.Screen name="salescrm" options={{ href: null }} />
            <Tabs.Screen name="pricing" options={{ href: null }} />
            <Tabs.Screen name="manufacturing" options={{ href: null }} />
            <Tabs.Screen name="stockmovements" options={{ href: null }} />
            <Tabs.Screen name="medicalreps" options={{ href: null }} />
            <Tabs.Screen name="mr-my-day" options={{ title: 'My Day', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'today' : 'today-outline'} size={size} color={color} /> }} />
            <Tabs.Screen name="doctors" options={{ href: null }} />
            <Tabs.Screen name="profile" options={{ href: null }} />
            <Tabs.Screen name="campaigns" options={{ href: null }} />
          </Tabs>
          </ErrorBoundary>
        </View>
      </View>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_500: require('../assets/fonts/Manrope_500.ttf'),
    Manrope_600: require('../assets/fonts/Manrope_600.ttf'),
    Manrope_700: require('../assets/fonts/Manrope_700.ttf'),
    Manrope_800: require('../assets/fonts/Manrope_800.ttf'),
    Inter_500: require('../assets/fonts/Inter_500.ttf'),
    Inter_600: require('../assets/fonts/Inter_600.ttf'),
    Inter_700: require('../assets/fonts/Inter_700.ttf'),
    Inter_800: require('../assets/fonts/Inter_800.ttf'),
  });
  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <MainLayout />
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  mainContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Global Top Header Styles
  topHeader: {
    height: 62,
    backgroundColor: colors.bg.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    ...Shadows.header,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 60,
    height: 28,
  },
  headerBrandText: { ...Typography.h3, fontWeight: '800', color: colors.text.primary },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
  },
  headerUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  headerAvatarText: { ...Typography.body, fontWeight: '800', color: colors.text.primary },
  headerUserInfo: {
    justifyContent: 'center',
  },
  headerUserName: { ...Typography.bodySm, fontWeight: '700', color: colors.text.primary, marginBottom: 2 },
  roleBadge: {
    borderWidth: 1,
    borderRadius: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  roleText: { ...Typography.eyebrow, fontWeight: '800' },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: { ...Typography.eyebrow, fontWeight: '700', marginLeft: 6 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.danger + '10',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.danger + '25',
  },
  logoutBtnText: { ...Typography.caption, fontWeight: '700', color: colors.danger },
  hamburgerBtn: {
    minWidth: 44,
    minHeight: ControlHeight.buttonMd,
    padding: 10,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileTabBar: {
    backgroundColor: colors.bg.secondary,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 6,
    flexDirection: 'row',
    alignItems: 'stretch',
    ...Shadows.header,
  },
  mobileTabItem: {
    flex: 1,
    minHeight: ControlHeight.buttonMd,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  mobileTabLabel: { ...Typography.eyebrow, textTransform: 'none', letterSpacing: 0.1 },

  // Submenu Styles
  submenuContainer: {
    paddingLeft: 12,
    marginTop: 2,
    marginBottom: 4,
    borderLeftWidth: 1.5,
    borderLeftColor: colors.border,
    marginLeft: 18,
    gap: 2,
  },
  submenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
  },
  submenuItemActive: {
    backgroundColor: colors.primaryLight,
  },
  submenuText: { ...Typography.bodySm, fontWeight: '600', color: colors.text.secondary, marginLeft: 10 },
  submenuTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },

  // Mobile Drawer Overlay
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  drawerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawerContent: {
    width: 260,
    height: '100%',
    flexDirection: 'column',
    backgroundColor: colors.bg.primary,
    boxShadow: '4px 0px 10px rgba(0,0,0,0.2)',
    elevation: 16,
    paddingTop: 10,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  drawerTitle: { ...Typography.h3, fontWeight: '800', color: colors.text.primary },
  drawerCloseBtn: {
    minWidth: 44,
    minHeight: ControlHeight.buttonMd,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
