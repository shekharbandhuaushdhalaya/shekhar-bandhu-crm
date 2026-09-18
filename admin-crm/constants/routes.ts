/**
 * Central Route Metadata for Shekhar Bandhu Aushadhalaya CRM.
 *
 * This file is the single source of truth for:
 * 1. Page titles displayed in TopHeader (breadcrumb / page name)
 * 2. Navigation routes searchable in GlobalSearchModal
 *
 * Add new routes here when creating new pages.
 */

/** A navigation route with optional RBAC permission guard */
export interface RouteMetadata {
  /** The Expo Router path (e.g. '/parties/customers') */
  path: string;
  /** Human-readable page title */
  title: string;
  /** Ionicons icon name for search results */
  icon: string;
  /** Optional RBAC permission string (uses usePermission().can()) */
  permission?: string;
}

/**
 * All application routes in priority order.
 * Entries are matched prefix-first for page title detection.
 */
export const APP_ROUTES: RouteMetadata[] = [
  { path: '/parties/customers', title: 'Customers',                  icon: 'people' },
  { path: '/parties/vendors',   title: 'Vendors',                    icon: 'business' },
  { path: '/products',          title: 'Products',                   icon: 'cube' },
  { path: '/invoices/sale',     title: 'Sales Invoices',             icon: 'document-text' },
  { path: '/invoices/purchase', title: 'Purchase Invoices',          icon: 'document-text', permission: 'invoice:view' },
  { path: '/inventories',       title: 'Inventories & Warehouses',   icon: 'layers' },
  { path: '/inventory-reconciliation', title: 'Inventory Reconciliation', icon: 'sync-outline' },
  { path: '/leads',             title: 'Leads',                      icon: 'git-branch' },
  { path: '/queries',           title: 'Web Queries',                icon: 'mail' },
  { path: '/orders',            title: 'Orders',                     icon: 'cart' },
  { path: '/quotations',        title: 'Quotations',                 icon: 'document' },
  { path: '/payments',          title: 'Payments',                   icon: 'cash' },
  { path: '/ageing',            title: 'Receivable Ageing',          icon: 'bar-chart-outline' },
  { path: '/reports',           title: 'Reports',                    icon: 'bar-chart', permission: 'report:view' },
  { path: '/rbac',              title: 'Access Control',             icon: 'shield-checkmark-outline', permission: 'rbac:view' },
  { path: '/audit',             title: 'System Audit Logs',          icon: 'clipboard-outline', permission: 'audit:view' },
  { path: '/manufacturing',     title: 'Manufacturing & BMR',        icon: 'analytics' },
  { path: '/stockmovements',    title: 'Delivery Challans',          icon: 'cube-outline' },
  { path: '/campaigns',         title: 'Campaigns',                  icon: 'megaphone-outline' },
  { path: '/credit-notes',      title: 'Credit / Debit Notes',       icon: 'document-outline' },
  { path: '/gst-returns',       title: 'GST Returns',                icon: 'receipt-outline' },
  { path: '/ai-analytics',      title: 'AI Business Assistant',      icon: 'sparkles-outline' },
  { path: '/sales-workspace',   title: 'Sales Workspace',            icon: 'options' },
  { path: '/sales-intelligence', title: 'Sales Intelligence',        icon: 'trending-up-outline' },
  { path: '/medicalreps',       title: 'Medical Representatives',    icon: 'people-circle', permission: 'mr:view' },
  { path: '/doctors',           title: 'Doctor Directory',           icon: 'medical-outline', permission: 'mr:view' },
  { path: '/mr-my-day',         title: 'MR My Day',                  icon: 'today-outline', permission: 'mr:view' },
  { path: '/compliance',        title: 'GMP & Compliance',           icon: 'checkmark-circle-outline' },
  { path: '/profile',           title: 'My Details',                 icon: 'person-circle-outline' },
];

/**
 * Get the display title for a given path.
 * Matches on prefix — longer paths first is handled by route order above.
 * Returns empty string if no match (caller should handle Dashboard separately).
 */
export function getRouteTitle(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'Dashboard';
  for (const route of APP_ROUTES) {
    if (pathname.startsWith(route.path)) return route.title;
  }
  return '';
}
