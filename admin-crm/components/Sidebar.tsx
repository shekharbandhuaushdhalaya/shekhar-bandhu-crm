import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useEffect, useState } from 'react';
import { useTheme, useStyles } from '../utils/themeContext';
import { useAuth } from '../utils/auth';
import { usePermission } from '../utils/permissions';
import { LightColors, Spacing, Radius } from '../constants/theme';

const createSidebarStyles = (colors: typeof LightColors) => StyleSheet.create({
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
});

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const { user } = useAuth();
  const perm = usePermission();
  const styles = useStyles(createSidebarStyles);

  const [opsExpanded, setOpsExpanded] = useState(
    pathname.includes('products') ||
    pathname.includes('inventories') ||
    pathname.includes('manufacturing') ||
    pathname.includes('stockmovements') ||
    pathname.includes('inventorydispatch')
  );
  const [salesExpanded, setSalesExpanded] = useState(
    pathname.includes('leads') ||
    pathname.includes('queries') ||
    pathname.includes('parties/customers') ||
    pathname.includes('orders') ||
    pathname.includes('invoices') ||
    pathname.includes('payments') ||
    pathname.includes('salescrm') ||
    pathname.includes('medicalreps') ||
    pathname.includes('campaigns') ||
    pathname.includes('pricing')
  );
  const [systemExpanded, setSystemExpanded] = useState(
    pathname.includes('parties/vendors') ||
    pathname.includes('reports') ||
    pathname.includes('rbac') ||
    pathname.includes('audit') ||
    pathname.includes('profile')
  );

  useEffect(() => {
    if (pathname.includes('products') || pathname.includes('inventories') || pathname.includes('manufacturing')) {
      setOpsExpanded(true);
    }
    if (pathname.includes('leads') || pathname.includes('queries') || pathname.includes('parties/customers') || pathname.includes('orders') || pathname.includes('salescrm') || pathname.includes('campaigns')) {
      setSalesExpanded(true);
    }
    if (pathname.includes('invoices') || pathname.includes('payments') || pathname.includes('parties/vendors') || pathname.includes('inventorydispatch') || pathname.includes('pricing')) {
      setFinanceExpanded(true);
    }
    if (pathname.includes('reports') || pathname.includes('rbac') || pathname.includes('audit') || pathname.includes('profile')) {
      setSystemExpanded(true);
    }
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

          {/* Group 1: Operations */}
          <TouchableOpacity
            style={[styles.sidebarNavItem, opsExpanded && styles.sidebarNavItemParentActive]}
            onPress={() => setOpsExpanded(!opsExpanded)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="business-outline"
              size={18}
              color={colors.text.secondary}
            />
            <Text style={[styles.sidebarNavText, { flex: 1 }]}>Operations</Text>
            <Ionicons
              name={opsExpanded ? "chevron-down" : "chevron-forward"}
              size={14}
              color={colors.text.secondary}
            />
          </TouchableOpacity>

          {opsExpanded && (
            <View style={{ paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.border, marginLeft: 20, gap: 2, marginVertical: 4 }}>
              {/* Products */}
              <TouchableOpacity
                style={[styles.sidebarNavItem, isActive('products') && styles.sidebarNavItemActive]}
                onPress={() => handlePress('products')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isActive('products') ? 'cube' : 'cube-outline'}
                  size={16}
                  color={isActive('products') ? colors.primary : colors.text.secondary}
                />
                <Text style={[styles.sidebarNavText, isActive('products') && styles.sidebarNavTextActive]}>
                  Products
                </Text>
              </TouchableOpacity>

              {/* Inventories */}
              <TouchableOpacity
                style={[styles.sidebarNavItem, isActive('inventories') && styles.sidebarNavItemActive]}
                onPress={() => handlePress('inventories')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isActive('inventories') ? 'home' : 'home-outline'}
                  size={16}
                  color={isActive('inventories') ? colors.primary : colors.text.secondary}
                />
                <Text style={[styles.sidebarNavText, isActive('inventories') && styles.sidebarNavTextActive]}>
                  Inventories
                </Text>
              </TouchableOpacity>

              {/* Manufacturing */}
              <TouchableOpacity
                style={[styles.sidebarNavItem, isActive('manufacturing') && styles.sidebarNavItemActive]}
                onPress={() => handlePress('manufacturing')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isActive('manufacturing') ? 'hammer' : 'hammer-outline'}
                  size={16}
                  color={isActive('manufacturing') ? colors.primary : colors.text.secondary}
                />
                <Text style={[styles.sidebarNavText, isActive('manufacturing') && styles.sidebarNavTextActive]}>
                  Manufacturing
                </Text>
              </TouchableOpacity>

              {/* Stock Movements */}
              {perm.can('stockmovement:view') && (
                <TouchableOpacity
                  style={[styles.sidebarNavItem, isActive('stockmovements') && styles.sidebarNavItemActive]}
                  onPress={() => handlePress('stockmovements')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isActive('stockmovements') ? 'swap-horizontal' : 'swap-horizontal-outline'}
                    size={16}
                    color={isActive('stockmovements') ? colors.primary : colors.text.secondary}
                  />
                  <Text style={[styles.sidebarNavText, isActive('stockmovements') && styles.sidebarNavTextActive]}>
                    Stock Movements
                  </Text>
                </TouchableOpacity>
              )}

              {/* Challans & Dispatch */}
              <TouchableOpacity
                style={[styles.sidebarNavItem, isActive('inventorydispatch') && styles.sidebarNavItemActive]}
                onPress={() => handlePress('inventorydispatch')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isActive('inventorydispatch') ? 'bus' : 'bus-outline'}
                  size={16}
                  color={isActive('inventorydispatch') ? colors.primary : colors.text.secondary}
                />
                <Text style={[styles.sidebarNavText, isActive('inventorydispatch') && styles.sidebarNavTextActive]}>
                  Challans & Dispatch
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Group 2: Sales & CRM */}
          <TouchableOpacity
            style={[styles.sidebarNavItem, salesExpanded && styles.sidebarNavItemParentActive]}
            onPress={() => setSalesExpanded(!salesExpanded)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="people-outline"
              size={18}
              color={colors.text.secondary}
            />
            <Text style={[styles.sidebarNavText, { flex: 1 }]}>Sales & CRM</Text>
            <Ionicons
              name={salesExpanded ? "chevron-down" : "chevron-forward"}
              size={14}
              color={colors.text.secondary}
            />
          </TouchableOpacity>

          {salesExpanded && (
            <View style={{ paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.border, marginLeft: 20, gap: 2, marginVertical: 4 }}>
              {/* Leads */}
              <TouchableOpacity
                style={[styles.sidebarNavItem, isActive('leads') && styles.sidebarNavItemActive]}
                onPress={() => handlePress('leads')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isActive('leads') ? 'git-branch' : 'git-branch-outline'}
                  size={16}
                  color={isActive('leads') ? colors.primary : colors.text.secondary}
                />
                <Text style={[styles.sidebarNavText, isActive('leads') && styles.sidebarNavTextActive]}>
                  Leads
                </Text>
              </TouchableOpacity>

              {/* Web Queries */}
              <TouchableOpacity
                style={[styles.sidebarNavItem, isActive('queries') && styles.sidebarNavItemActive]}
                onPress={() => handlePress('queries')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isActive('queries') ? 'mail-unread' : 'mail-unread-outline'}
                  size={16}
                  color={isActive('queries') ? colors.primary : colors.text.secondary}
                />
                <Text style={[styles.sidebarNavText, isActive('queries') && styles.sidebarNavTextActive]}>
                  Web Queries
                </Text>
              </TouchableOpacity>

              {/* Customers */}
              <TouchableOpacity
                style={[styles.sidebarNavItem, isActive('parties/customers') && styles.sidebarNavItemActive]}
                onPress={() => handlePress('parties/customers')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isActive('parties/customers') ? 'people' : 'people-outline'}
                  size={16}
                  color={isActive('parties/customers') ? colors.primary : colors.text.secondary}
                />
                <Text style={[styles.sidebarNavText, isActive('parties/customers') && styles.sidebarNavTextActive]}>
                  Customers
                </Text>
              </TouchableOpacity>

              {/* Orders */}
              <TouchableOpacity
                style={[styles.sidebarNavItem, isActive('orders') && styles.sidebarNavItemActive]}
                onPress={() => handlePress('orders')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isActive('orders') ? 'cart' : 'cart-outline'}
                  size={16}
                  color={isActive('orders') ? colors.primary : colors.text.secondary}
                />
                <Text style={[styles.sidebarNavText, isActive('orders') && styles.sidebarNavTextActive]}>
                  Orders
                </Text>
              </TouchableOpacity>

              {/* Invoices */}
              <TouchableOpacity
                style={[styles.sidebarNavItem, isActive('invoices/sale') && styles.sidebarNavItemActive]}
                onPress={() => handlePress('invoices/sale')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isActive('invoices/sale') ? 'receipt' : 'receipt-outline'}
                  size={16}
                  color={isActive('invoices/sale') ? colors.primary : colors.text.secondary}
                />
                <Text style={[styles.sidebarNavText, isActive('invoices/sale') && styles.sidebarNavTextActive]}>
                  Invoices
                </Text>
              </TouchableOpacity>

              {/* Payments */}
              <TouchableOpacity
                style={[styles.sidebarNavItem, isActive('payments') && styles.sidebarNavItemActive]}
                onPress={() => handlePress('payments')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isActive('payments') ? 'cash' : 'cash-outline'}
                  size={16}
                  color={isActive('payments') ? colors.primary : colors.text.secondary}
                />
                <Text style={[styles.sidebarNavText, isActive('payments') && styles.sidebarNavTextActive]}>
                  Payments
                </Text>
              </TouchableOpacity>

              {/* Sales Targets */}
              <TouchableOpacity
                style={[styles.sidebarNavItem, isActive('salescrm') && styles.sidebarNavItemActive]}
                onPress={() => handlePress('salescrm')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isActive('salescrm') ? 'people-circle' : 'people-circle-outline'}
                  size={16}
                  color={isActive('salescrm') ? colors.primary : colors.text.secondary}
                />
                <Text style={[styles.sidebarNavText, isActive('salescrm') && styles.sidebarNavTextActive]}>
                  Sales Targets
                </Text>
              </TouchableOpacity>

              {/* Medical Reps */}
              {perm.can('mr:view') && (
                <TouchableOpacity
                  style={[styles.sidebarNavItem, isActive('medicalreps') && styles.sidebarNavItemActive]}
                  onPress={() => handlePress('medicalreps')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isActive('medicalreps') ? 'people' : 'people-outline'}
                    size={16}
                    color={isActive('medicalreps') ? colors.primary : colors.text.secondary}
                  />
                  <Text style={[styles.sidebarNavText, isActive('medicalreps') && styles.sidebarNavTextActive]}>
                    Medical Reps
                  </Text>
                </TouchableOpacity>
              )}

              {/* Campaigns */}
              {perm.can('campaign:view') && (
                <TouchableOpacity
                  style={[styles.sidebarNavItem, isActive('campaigns') && styles.sidebarNavItemActive]}
                  onPress={() => handlePress('campaigns')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isActive('campaigns') ? 'megaphone' : 'megaphone-outline'}
                    size={16}
                    color={isActive('campaigns') ? colors.primary : colors.text.secondary}
                  />
                  <Text style={[styles.sidebarNavText, isActive('campaigns') && styles.sidebarNavTextActive]}>
                    Campaigns
                  </Text>
                </TouchableOpacity>
              )}

              {/* Pricing & Discounts */}
              {perm.can('product:editPricing') && (
                <TouchableOpacity
                  style={[styles.sidebarNavItem, isActive('pricing') && styles.sidebarNavItemActive]}
                  onPress={() => handlePress('pricing')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isActive('pricing') ? 'pricetag' : 'pricetag-outline'}
                    size={16}
                    color={isActive('pricing') ? colors.primary : colors.text.secondary}
                  />
                  <Text style={[styles.sidebarNavText, isActive('pricing') && styles.sidebarNavTextActive]}>
                    Pricing & Discounts
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Group 3: System & Settings */}
          <TouchableOpacity
            style={[styles.sidebarNavItem, systemExpanded && styles.sidebarNavItemParentActive]}
            onPress={() => setSystemExpanded(!systemExpanded)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="settings-outline"
              size={18}
              color={colors.text.secondary}
            />
            <Text style={[styles.sidebarNavText, { flex: 1 }]}>System & Settings</Text>
            <Ionicons
              name={systemExpanded ? "chevron-down" : "chevron-forward"}
              size={14}
              color={colors.text.secondary}
            />
          </TouchableOpacity>

          {systemExpanded && (
            <View style={{ paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.border, marginLeft: 20, gap: 2, marginVertical: 4 }}>
              {/* Vendors */}
              <TouchableOpacity
                style={[styles.sidebarNavItem, isActive('parties/vendors') && styles.sidebarNavItemActive]}
                onPress={() => handlePress('parties/vendors')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isActive('parties/vendors') ? 'storefront' : 'storefront-outline'}
                  size={16}
                  color={isActive('parties/vendors') ? colors.primary : colors.text.secondary}
                />
                <Text style={[styles.sidebarNavText, isActive('parties/vendors') && styles.sidebarNavTextActive]}>
                  Vendors
                </Text>
              </TouchableOpacity>

              {/* Reports */}
              {perm.can('report:view') && (
                <TouchableOpacity
                  style={[styles.sidebarNavItem, isActive('reports') && styles.sidebarNavItemActive]}
                  onPress={() => handlePress('reports')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isActive('reports') ? 'bar-chart' : 'bar-chart-outline'}
                    size={16}
                    color={isActive('reports') ? colors.primary : colors.text.secondary}
                  />
                  <Text style={[styles.sidebarNavText, isActive('reports') && styles.sidebarNavTextActive]}>
                    Reports
                  </Text>
                </TouchableOpacity>
              )}

              {/* Access Control */}
              {perm.can('rbac:manage') && (
                <TouchableOpacity
                  style={[styles.sidebarNavItem, isActive('rbac') && styles.sidebarNavItemActive]}
                  onPress={() => handlePress('rbac')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isActive('rbac') ? 'shield-checkmark' : 'shield-checkmark-outline'}
                    size={16}
                    color={isActive('rbac') ? colors.primary : colors.text.secondary}
                  />
                  <Text style={[styles.sidebarNavText, isActive('rbac') && styles.sidebarNavTextActive]}>
                    Access Control
                  </Text>
                </TouchableOpacity>
              )}

              {/* Audit Logs */}
              {perm.can('audit:view') && (
                <TouchableOpacity
                  style={[styles.sidebarNavItem, isActive('audit') && styles.sidebarNavItemActive]}
                  onPress={() => handlePress('audit')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isActive('audit') ? 'newspaper' : 'newspaper-outline'}
                    size={16}
                    color={isActive('audit') ? colors.primary : colors.text.secondary}
                  />
                  <Text style={[styles.sidebarNavText, isActive('audit') && styles.sidebarNavTextActive]}>
                    Audit Logs
                  </Text>
                </TouchableOpacity>
              )}

              {/* My Details */}
              <TouchableOpacity
                style={[styles.sidebarNavItem, isActive('profile') && styles.sidebarNavItemActive]}
                onPress={() => handlePress('profile')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isActive('profile') ? 'person' : 'person-outline'}
                  size={16}
                  color={isActive('profile') ? colors.primary : colors.text.secondary}
                />
                <Text style={[styles.sidebarNavText, isActive('profile') && styles.sidebarNavTextActive]}>
                  My Details
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

export default Sidebar;
