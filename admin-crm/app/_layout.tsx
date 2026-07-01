import { Tabs, useRouter, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, Spacing, Radius, Shadows } from '../constants/theme';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useWindowDimensions, Modal, Pressable, ScrollView, Image, DeviceEventEmitter } from 'react-native';
import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { api } from '../utils/api';
import { AuthProvider, useAuth } from '../utils/auth';
import { ThemeProvider, useTheme, useStyles } from '../utils/themeContext';
import LoginScreen from './login';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

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
    if (path.startsWith('/invoices/sale')) return 'Sale Invoice';
    if (path.startsWith('/invoices/purchase')) return 'Purchase Invoice';
    if (path.startsWith('/payments')) return 'Payments';
    if (path.startsWith('/reports')) return 'Reports';
    if (path.startsWith('/rbac')) return 'Access Control';
    if (path.startsWith('/pricing')) return 'Pricing & Discounts';
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
          <TouchableOpacity onPress={() => router.push('/')} activeOpacity={0.7}>
            <Image 
              source={require('../assets/logo.png')} 
              style={[styles.logoImage, { width: isDesktop ? 140 : 60, height: isDesktop ? 40 : 28 }]}
              resizeMode="contain"
            />
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
        {/* Connection status */}
        <View style={[styles.statusBadge, { backgroundColor: isOnline ? colors.successLight : colors.warningLight, borderColor: isOnline ? colors.success : colors.warning }]}>
          <View style={[styles.dot, { backgroundColor: isOnline ? colors.success : colors.warning }]} />
          {isDesktop && (
            <Text style={[styles.badgeText, { color: isOnline ? colors.success : colors.warning }]}>
              {isOnline ? 'Synced' : 'Local'}
            </Text>
          )}
        </View>

        {/* Theme Toggle */}
        <TouchableOpacity onPress={toggleTheme} style={styles.headerBtn} activeOpacity={0.7}>
          <Ionicons name={themeMode === 'dark' ? 'sunny-outline' : 'moon-outline'} size={18} color={colors.text.secondary} />
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.headerDivider} />

        {/* User Card */}
        <View style={styles.headerUser}>
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
        </View>

        {/* Logout */}
        <TouchableOpacity onPress={logout} style={styles.logoutBtn} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={16} color={colors.danger} />
          {isDesktop && <Text style={styles.logoutBtnText}>Sign Out</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useStyles(createStyles);

  const [partiesExpanded, setPartiesExpanded] = useState(pathname.includes('parties'));
  const [invoicesExpanded, setInvoicesExpanded] = useState(pathname.includes('invoices'));

  useEffect(() => {
    if (pathname.includes('parties')) setPartiesExpanded(true);
    if (pathname.includes('invoices')) setInvoicesExpanded(true);
  }, [pathname]);

  const isActive = (routeName: string) => {
    if (routeName === 'index') return pathname === '/';
    return pathname.startsWith(`/${routeName}`);
  };

  const handlePress = (routeName: string) => {
    router.push(routeName === 'index' ? '/' : `/${routeName}`);
    if (onNavigate) onNavigate();
  };

  return (
    <View style={styles.sidebar}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sidebarScroll}>
        <View style={styles.sidebarNav}>
          {/* Dashboard */}
          <TouchableOpacity
            style={[styles.sidebarNavItem, isActive('index') && styles.sidebarNavItemActive]}
            onPress={() => handlePress('index')}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isActive('index') ? 'grid' : 'grid-outline'}
              size={18}
              color={isActive('index') ? colors.primary : colors.text.secondary}
            />
            <Text style={[styles.sidebarNavText, isActive('index') && styles.sidebarNavTextActive]}>
              Dashboard
            </Text>
            {isActive('index') && <View style={styles.activeIndicator} />}
          </TouchableOpacity>

          {/* Products */}
          <TouchableOpacity
            style={[styles.sidebarNavItem, isActive('products') && styles.sidebarNavItemActive]}
            onPress={() => handlePress('products')}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isActive('products') ? 'cube' : 'cube-outline'}
              size={18}
              color={isActive('products') ? colors.primary : colors.text.secondary}
            />
            <Text style={[styles.sidebarNavText, isActive('products') && styles.sidebarNavTextActive]}>
              Products
            </Text>
            {isActive('products') && <View style={styles.activeIndicator} />}
          </TouchableOpacity>

          {/* Leads */}
          <TouchableOpacity
            style={[styles.sidebarNavItem, isActive('leads') && styles.sidebarNavItemActive]}
            onPress={() => handlePress('leads')}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isActive('leads') ? 'git-branch' : 'git-branch-outline'}
              size={18}
              color={isActive('leads') ? colors.primary : colors.text.secondary}
            />
            <Text style={[styles.sidebarNavText, isActive('leads') && styles.sidebarNavTextActive]}>
              Leads
            </Text>
            {isActive('leads') && <View style={styles.activeIndicator} />}
          </TouchableOpacity>

          {/* Web Queries */}
          <TouchableOpacity
            style={[styles.sidebarNavItem, isActive('queries') && styles.sidebarNavItemActive]}
            onPress={() => handlePress('queries')}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isActive('queries') ? 'mail-unread' : 'mail-unread-outline'}
              size={18}
              color={isActive('queries') ? colors.primary : colors.text.secondary}
            />
            <Text style={[styles.sidebarNavText, isActive('queries') && styles.sidebarNavTextActive]}>
              Web Queries
            </Text>
            {isActive('queries') && <View style={styles.activeIndicator} />}
          </TouchableOpacity>

          {/* Orders */}
          <TouchableOpacity
            style={[styles.sidebarNavItem, isActive('orders') && styles.sidebarNavItemActive]}
            onPress={() => handlePress('orders')}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isActive('orders') ? 'cart' : 'cart-outline'}
              size={18}
              color={isActive('orders') ? colors.primary : colors.text.secondary}
            />
            <Text style={[styles.sidebarNavText, isActive('orders') && styles.sidebarNavTextActive]}>
              Orders
            </Text>
            {isActive('orders') && <View style={styles.activeIndicator} />}
          </TouchableOpacity>

          {/* Quotations */}
          <TouchableOpacity
            style={[styles.sidebarNavItem, isActive('quotations') && styles.sidebarNavItemActive]}
            onPress={() => handlePress('quotations')}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isActive('quotations') ? 'reader' : 'reader-outline'}
              size={18}
              color={isActive('quotations') ? colors.primary : colors.text.secondary}
            />
            <Text style={[styles.sidebarNavText, isActive('quotations') && styles.sidebarNavTextActive]}>
              Quotations
            </Text>
            {isActive('quotations') && <View style={styles.activeIndicator} />}
          </TouchableOpacity>


          {/* Parties Dropdown */}
          <View>
            <TouchableOpacity
              style={[styles.sidebarNavItem, pathname.includes('parties') && styles.sidebarNavItemParentActive]}
              onPress={() => setPartiesExpanded(!partiesExpanded)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="people-outline"
                size={18}
                color={pathname.includes('parties') ? colors.primary : colors.text.secondary}
              />
              <Text style={[styles.sidebarNavText, pathname.includes('parties') && styles.sidebarNavTextActive, { flex: 1 }]}>
                Parties
              </Text>
              <Ionicons
                name={partiesExpanded ? 'chevron-down-outline' : 'chevron-forward-outline'}
                size={14}
                color={colors.text.muted}
              />
            </TouchableOpacity>
            {partiesExpanded && (
              <View style={styles.submenuContainer}>
                <TouchableOpacity
                  style={[styles.submenuItem, isActive('parties/customers') && styles.submenuItemActive]}
                  onPress={() => handlePress('parties/customers')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isActive('parties/customers') ? 'people' : 'people-outline'}
                    size={14}
                    color={isActive('parties/customers') ? colors.primary : colors.text.secondary}
                  />
                  <Text style={[styles.submenuText, isActive('parties/customers') && styles.submenuTextActive]}>
                    Customers
                  </Text>
                </TouchableOpacity>
                {user && user.role !== 'agent' && (
                  <TouchableOpacity
                    style={[styles.submenuItem, isActive('parties/vendors') && styles.submenuItemActive]}
                    onPress={() => handlePress('parties/vendors')}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={isActive('parties/vendors') ? 'cube' : 'cube-outline'}
                      size={14}
                      color={isActive('parties/vendors') ? colors.primary : colors.text.secondary}
                    />
                    <Text style={[styles.submenuText, isActive('parties/vendors') && styles.submenuTextActive]}>
                      Vendors
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>


          {/* Invoices Dropdown */}
          <View>
            <TouchableOpacity
              style={[styles.sidebarNavItem, pathname.includes('invoices') && styles.sidebarNavItemParentActive]}
              onPress={() => setInvoicesExpanded(!invoicesExpanded)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="receipt-outline"
                size={18}
                color={pathname.includes('invoices') ? colors.primary : colors.text.secondary}
              />
              <Text style={[styles.sidebarNavText, pathname.includes('invoices') && styles.sidebarNavTextActive, { flex: 1 }]}>
                Invoices
              </Text>
              <Ionicons
                name={invoicesExpanded ? 'chevron-down-outline' : 'chevron-forward-outline'}
                size={14}
                color={colors.text.muted}
              />
            </TouchableOpacity>
            {invoicesExpanded && (
              <View style={styles.submenuContainer}>
                <TouchableOpacity
                  style={[styles.submenuItem, isActive('invoices/sale') && styles.submenuItemActive]}
                  onPress={() => handlePress('invoices/sale')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isActive('invoices/sale') ? 'receipt' : 'receipt-outline'}
                    size={14}
                    color={isActive('invoices/sale') ? colors.primary : colors.text.secondary}
                  />
                  <Text style={[styles.submenuText, isActive('invoices/sale') && styles.submenuTextActive]}>
                    Sale Invoice
                  </Text>
                </TouchableOpacity>
                {user && user.role !== 'agent' && (
                  <TouchableOpacity
                    style={[styles.submenuItem, isActive('invoices/purchase') && styles.submenuItemActive]}
                    onPress={() => handlePress('invoices/purchase')}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={isActive('invoices/purchase') ? 'document-text' : 'document-text-outline'}
                      size={14}
                      color={isActive('invoices/purchase') ? colors.primary : colors.text.secondary}
                    />
                    <Text style={[styles.submenuText, isActive('invoices/purchase') && styles.submenuTextActive]}>
                      Purchase Invoice
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Payments */}
          <TouchableOpacity
            style={[styles.sidebarNavItem, isActive('payments') && styles.sidebarNavItemActive]}
            onPress={() => handlePress('payments')}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isActive('payments') ? 'wallet' : 'wallet-outline'}
              size={18}
              color={isActive('payments') ? colors.primary : colors.text.secondary}
            />
            <Text style={[styles.sidebarNavText, isActive('payments') && styles.sidebarNavTextActive]}>
              Payments
            </Text>
            {isActive('payments') && <View style={styles.activeIndicator} />}
          </TouchableOpacity>

          {/* Inventories */}
          <TouchableOpacity
            style={[styles.sidebarNavItem, isActive('inventories') && styles.sidebarNavItemActive]}
            onPress={() => handlePress('inventories')}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isActive('inventories') ? 'home' : 'home-outline'}
              size={18}
              color={isActive('inventories') ? colors.primary : colors.text.secondary}
            />
            <Text style={[styles.sidebarNavText, isActive('inventories') && styles.sidebarNavTextActive]}>
              Inventories
            </Text>
            {isActive('inventories') && <View style={styles.activeIndicator} />}
          </TouchableOpacity>

          {/* Reports */}
          {user && user.role !== 'agent' && (
            <TouchableOpacity
              style={[styles.sidebarNavItem, isActive('reports') && styles.sidebarNavItemActive]}
              onPress={() => handlePress('reports')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isActive('reports') ? 'bar-chart' : 'bar-chart-outline'}
                size={18}
                color={isActive('reports') ? colors.primary : colors.text.secondary}
              />
              <Text style={[styles.sidebarNavText, isActive('reports') && styles.sidebarNavTextActive]}>
                Reports
              </Text>
              {isActive('reports') && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          )}

          {/* Pricing & Discounts */}
          {user && user.role !== 'agent' && (
            <TouchableOpacity
              style={[styles.sidebarNavItem, isActive('pricing') && styles.sidebarNavItemActive]}
              onPress={() => handlePress('pricing')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isActive('pricing') ? 'pricetag' : 'pricetag-outline'}
                size={18}
                color={isActive('pricing') ? colors.primary : colors.text.secondary}
              />
              <Text style={[styles.sidebarNavText, isActive('pricing') && styles.sidebarNavTextActive]}>
                Pricing &amp; Discounts
              </Text>
              {isActive('pricing') && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          )}



          {/* Access Control */}
          {user && user.role === 'admin' && (
            <TouchableOpacity
              style={[styles.sidebarNavItem, isActive('rbac') && styles.sidebarNavItemActive]}
              onPress={() => handlePress('rbac')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isActive('rbac') ? 'shield-checkmark' : 'shield-checkmark-outline'}
                size={18}
                color={isActive('rbac') ? colors.primary : colors.text.secondary}
              />
              <Text style={[styles.sidebarNavText, isActive('rbac') && styles.sidebarNavTextActive]}>
                Access Control
              </Text>
              {isActive('rbac') && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

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

    return () => {
      unsubscribeNetInfo();
      sub.remove();
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
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
            flex: 1, backgroundColor: 'rgba(0,0,0,0.3)',
            justifyContent: 'center', alignItems: 'center',
            zIndex: 99999
          }}>
            <View style={{ 
              padding: 24, backgroundColor: colors.bg.card, borderRadius: Radius.lg, 
              alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, 
              shadowOpacity: 0.3, shadowRadius: 10, elevation: 10 
            }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ marginTop: 12, color: colors.text.primary, fontWeight: '700', fontSize: 15 }}>Processing...</Text>
            </View>
          </View>
        </Modal>
      )}

      {/* Dynamic Top Header */}
      <TopHeader user={user} isOnline={isOnline} logout={logout} toggleSidebar={() => setIsSidebarOpen(true)} />
      
      <View style={[styles.mainContainer, { flexDirection: isDesktop ? 'row' : 'column' }]}>
        {isDesktop && <Sidebar />}
        
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
                  <Text style={styles.drawerTitle}>Navigation Menu</Text>
                  <TouchableOpacity onPress={() => setIsSidebarOpen(false)} style={styles.drawerCloseBtn}>
                    <Ionicons name="close" size={24} color={colors.text.primary} />
                  </TouchableOpacity>
                </View>
                <Sidebar onNavigate={() => setIsSidebarOpen(false)} />
              </View>
            </View>
          </Modal>
        )}

        <View style={{ flex: 1 }}>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: 'none' },
              tabBarActiveTintColor: colors.primary,
              tabBarInactiveTintColor: colors.text.muted,
              tabBarLabelStyle: { fontWeight: '600', fontSize: 11 },
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
            <Tabs.Screen name="inventories" options={{ href: null }} />
            <Tabs.Screen name="invoices/sale" options={{ href: null }} />
            <Tabs.Screen name="invoices/purchase" options={{ href: null }} />
            <Tabs.Screen name="contacts" options={{ href: null }} />
            <Tabs.Screen name="pipeline" options={{ href: null }} />
            <Tabs.Screen name="login" options={{ href: null }} />
            <Tabs.Screen name="rbac" options={{ href: null }} />
            <Tabs.Screen name="queries" options={{ href: null }} />
            <Tabs.Screen name="orders" options={{ href: null }} />
            <Tabs.Screen name="pricing" options={{ href: null }} />
          </Tabs>
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
          <MainLayout />
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

  // Sidebar styles
  sidebar: {
    width: 230,
    backgroundColor: colors.bg.secondary,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    height: '100%',
  },
  sidebarScroll: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  sidebarNav: {
    gap: 4,
  },
  sidebarNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    position: 'relative',
  },
  sidebarNavItemActive: {
    backgroundColor: colors.primaryLight,
  },
  sidebarNavItemParentActive: {
    backgroundColor: 'rgba(0, 82, 204, 0.03)',
  },
  sidebarNavText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    marginLeft: 10,
  },
  sidebarNavTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
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
    backgroundColor: colors.bg.primary,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
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
