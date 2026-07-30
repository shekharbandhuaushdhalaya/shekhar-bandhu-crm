import { Tabs, useRouter, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, Spacing, Radius, Shadows } from '../constants/theme';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useWindowDimensions, Modal, Pressable, ScrollView, Image, DeviceEventEmitter, Platform } from 'react-native';
import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { api, API_BASE } from '../utils/api';
import { AuthProvider, useAuth } from '../utils/auth';
import { usePermission } from '../utils/permissions';
import { ThemeProvider, useTheme, useStyles } from '../utils/themeContext';
import { ToastProvider } from '../utils/ToastContext';
import LoginScreen from './login';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Sidebar, { SIDEBAR_WIDTH } from '../components/Sidebar';
import AyurvedicLoader from '../components/AyurvedicLoader';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { getSocket } from '../utils/socket';

function TopHeader({ user, isOnline, logout, toggleSidebar }: { user: any; isOnline: boolean; logout: () => void; toggleSidebar?: () => void }) {
  const { themeMode, toggleTheme, colors } = useTheme();
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  const getPageName = (path: string) => {
    if (path === '/') return 'Dashboard';
    if (path.startsWith('/parties/customers')) return 'Customers';
    if (path.startsWith('/parties/vendors')) return 'Vendors';
    if (path.startsWith('/products')) return 'Products';
    if (path.startsWith('/inventories')) return 'Inventories';
    if (path.startsWith('/leads')) return 'Leads';
    if (path.startsWith('/queries')) return 'Web Queries';
    if (path.startsWith('/orders')) return 'Orders';
    if (path.startsWith('/quotations')) return 'Quotations';
    if (path.startsWith('/invoices/sale')) return 'Sale Invoices';
    if (path.startsWith('/invoices/purchase')) return 'Purchase Invoices';
    if (path.startsWith('/payments')) return 'Payments';
    if (path.startsWith('/ageing')) return 'Receivable Ageing';
    if (path.startsWith('/reports')) return 'Reports';
    if (path.startsWith('/rbac')) return 'Access Control';
    if (path.startsWith('/audit')) return 'System Audit Logs';
    if (path.startsWith('/pricing')) return 'Pricing & Discounts';
    if (path.startsWith('/manufacturing')) return 'Manufacturing / BMR';
    if (path.startsWith('/salescrm')) return 'Sales & CRM';
    if (path.startsWith('/inventorydispatch')) return 'Inventory & Dispatch';
    if (path.startsWith('/stockmovements')) return 'Delivery Challans';
    if (path.startsWith('/profile')) return 'My Details';
    if (path.startsWith('/campaigns')) return 'Campaigns';
    if (path.startsWith('/ai-analytics')) return 'AI Business Assistant';
    if (path.startsWith('/credit-notes')) return 'Credit / Debit Notes';
    if (path.startsWith('/gst-returns')) return 'GST Returns';
    if (path.startsWith('/medicalreps')) return 'Medical Representatives';
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
            <TouchableOpacity onPress={toggleSidebar} style={styles.hamburgerBtn} activeOpacity={0.7}>
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
            {isDesktop && (
              <View style={{ flexDirection: 'column', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text.primary, letterSpacing: 0.5, lineHeight: 15 }}>
                  SHEKHAR BANDHU
                </Text>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary, letterSpacing: 0.8, marginTop: 1 }}>
                  AUSHADHALAYA
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {isDesktop && pageName ? (
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary }}>
              {pageName}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Right Controls */}
      <View style={styles.headerControls}>


        {/* User Card */}
        <TouchableOpacity style={styles.headerUser} onPress={() => router.push('/profile')} activeOpacity={0.7}>
          <View style={[styles.headerAvatar, { borderColor: roleColors[user.role] || colors.text.muted }]}>
            <Text style={styles.headerAvatarText}>{user.name.charAt(0)}</Text>
          </View>
          {isDesktop && (
            <View style={styles.headerUserInfo}>
              <Text style={styles.headerUserName} numberOfLines={1}>{user.name}</Text>
              <View style={[styles.roleBadge, { borderColor: roleColors[user.role] || colors.text.muted }]}>
                <Text style={[styles.roleText, { color: roleColors[user.role] || colors.text.muted }]}>
                  {user.role.toUpperCase()}
                </Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Sidebar extracted to components/Sidebar.tsx

function MainLayout() {
  const { user, loading, logout } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { themeMode, colors } = useTheme();
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  const [globalLoading, setGlobalLoading] = useState(false);

  useEffect(() => {
    const unsubscribeNetInfo = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected);
    });

    const sub = DeviceEventEmitter.addListener('global_loader', (data) => {
      setGlobalLoading(data.isLoading);
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
      socketEvents.forEach(eventName => {
        socket.off(eventName);
      });
    };
  }, []);

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
      <TopHeader user={user} isOnline={isOnline} logout={logout} toggleSidebar={() => setIsSidebarOpen(true)} />
      
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
            visible={isSidebarOpen}
            animationType="fade"
            onRequestClose={() => setIsSidebarOpen(false)}
          >
            <View style={styles.drawerOverlay}>
              <Pressable style={styles.drawerBackdrop} onPress={() => setIsSidebarOpen(false)} />
              <View style={[styles.drawerContent, { paddingTop: insets.top }]}>
                <View style={styles.drawerHeader}>
                  <Text style={styles.drawerTitle} numberOfLines={1}>SHEKHAR BANDHU AUSHADHALAYA</Text>
                  <TouchableOpacity onPress={() => setIsSidebarOpen(false)} style={styles.drawerCloseBtn}>
                    <Ionicons name="close" size={24} color={colors.text.primary} />
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Sidebar onNavigate={() => setIsSidebarOpen(false)} isOnline={isOnline} logout={logout} />
                </View>
              </View>
            </View>
          </Modal>
        )}

        <View style={{ flex: 1 }}>
          <ErrorBoundary>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: 'none' },
              tabBarActiveTintColor: colors.primary,
              tabBarInactiveTintColor: colors.text.muted,
              tabBarLabelStyle: { fontWeight: '600', fontSize: 11 },
              lazy: true,
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: 'Dashboard',
                tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
              }}
            />
            <Tabs.Screen
              name="leads"
              options={{
                title: 'Leads',
                tabBarIcon: ({ color, size }) => <Ionicons name="git-branch" size={size} color={color} />,
              }}
            />
            <Tabs.Screen
              name="reports"
              options={{
                title: 'Reports',
                tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart" size={size} color={color} />,
                href: (user && user.role === 'agent') ? null : undefined,
              }}
            />
            <Tabs.Screen name="parties/customers" options={{ href: null }} />
            <Tabs.Screen name="parties/vendors" options={{ href: null }} />
            <Tabs.Screen name="products" options={{ href: null }} />
            <Tabs.Screen name="payments" options={{ href: null }} />
            <Tabs.Screen name="ageing" options={{ href: null }} />
            <Tabs.Screen name="inventories" options={{ href: null }} />
            <Tabs.Screen name="invoices/sale" options={{ href: null }} />
            <Tabs.Screen name="invoices/purchase" options={{ href: null }} />
            <Tabs.Screen name="contacts" options={{ href: null }} />
            <Tabs.Screen name="pipeline" options={{ href: null }} />
            <Tabs.Screen name="login" options={{ href: null }} />
            <Tabs.Screen name="rbac" options={{ href: null }} />
            <Tabs.Screen name="audit" options={{ href: null }} />
            <Tabs.Screen name="queries" options={{ href: null }} />
            <Tabs.Screen name="orders" options={{ href: null }} />
            <Tabs.Screen name="pricing" options={{ href: null }} />
            <Tabs.Screen name="manufacturing" options={{ href: null }} />
            <Tabs.Screen name="medicalreps" options={{ href: null }} />
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
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <MainLayout />
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
    height: 64,
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
  headerBrandText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: 1.2,
  },
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
  headerAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
  },
  headerUserInfo: {
    justifyContent: 'center',
  },
  headerUserName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 2,
  },
  roleBadge: {
    borderWidth: 1,
    borderRadius: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  roleText: {
    fontSize: 8,
    fontWeight: '800',
  },
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
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 6,
  },
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
  logoutBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.danger,
  },
  hamburgerBtn: {
    padding: 4,
    marginRight: 2,
  },

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
  submenuText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.text.secondary,
    marginLeft: 10,
  },
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
  drawerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text.primary,
  },
  drawerCloseBtn: {
    padding: 4,
  },
});
