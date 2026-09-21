'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  LayoutDashboard, ShoppingCart, Package, Users, Building2,
  ShoppingBag, Truck, BookOpen, FileBarChart, Settings,
  ChevronDown, ChevronLeft, Menu, Store, Wrench, HandCoins,
  CreditCard, Landmark, Receipt, BarChart3, Barcode, Wallet,
  HelpCircle, LifeBuoy, HardDrive, UserCog, Shield, Activity,
  Tags, Layers, Warehouse, ArrowLeftRight, ClipboardList,
  RotateCcw, DollarSign, CalendarDays, CircleDollarSign,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth, hasPermission } from '@/lib/auth';

interface NavItem {
  title: string;
  icon?: any;
  href?: string;
  badge?: string;
  permission?: string;
  children?: NavItem[];
}

const NAV_ITEMS: NavItem[] = [
  { title: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', permission: 'reports.view' },
  {
    title: 'Products', icon: Package, permission: 'products.view',
    children: [
      { title: 'All Products', href: '/products', permission: 'products.view' },
      { title: 'Categories', href: '/products/categories', permission: 'products.categories.manage' },
      { title: 'Bundles', href: '/products/bundles', permission: 'products.view' },
      { title: 'Attributes', href: '/products/attributes', permission: 'products.view' },
      { title: 'Barcodes', href: '/products/barcodes', permission: 'products.view' },
    ],
  },
  {
    title: 'Inventory', icon: Warehouse, permission: 'inventory.view',
    children: [
      { title: 'Warehouses', href: '/inventory/warehouses', permission: 'inventory.view' },
      { title: 'Stock', href: '/inventory/stock', permission: 'inventory.view' },
      { title: 'Movements', href: '/inventory/movements', permission: 'inventory.movements' },
      { title: 'Transfers', href: '/inventory/transfers', permission: 'inventory.view' },
      { title: 'Adjustments', href: '/inventory/adjustments', permission: 'inventory.adjustments' },
    ],
  },
  {
    title: 'POS', icon: ShoppingCart, href: '/pos', badge: 'ALT+P', permission: 'pos.access',
  },
  {
    title: 'Sales', icon: ShoppingBag, permission: 'sales.view',
    children: [
      { title: 'All Sales', href: '/sales', permission: 'sales.view' },
      { title: 'Returns', href: '/sales/returns', permission: 'sales.returns.view' },
      { title: 'Return Logs', href: '/sales/return-logs', permission: 'sales.returns.view' },
    ],
  },
  {
    title: 'Customers', icon: Users, href: '/customers', permission: 'customers.view',
  },
  {
    title: 'Purchases', icon: Truck, permission: 'purchases.view',
    children: [
      { title: 'Purchase Orders', href: '/purchases/orders', permission: 'purchases.view' },
      { title: 'Receipts', href: '/purchases/receipts', permission: 'purchases.view' },
      { title: 'Returns', href: '/purchases/returns', permission: 'purchases.view' },
    ],
  },
  {
    title: 'Vendors', icon: Building2, href: '/vendors', permission: 'vendors.view',
  },
  {
    title: 'Accounting', icon: BookOpen, permission: 'accounting.view',
    children: [
      { title: 'Dashboard', href: '/accounting', permission: 'accounting.view' },
      { title: 'Chart of Accounts', href: '/accounting/chart-of-accounts', permission: 'accounting.view' },
      { title: 'Journal Entries', href: '/accounting/journal-entries', permission: 'accounting.view' },
      { title: 'Trial Balance', href: '/accounting/trial-balance', permission: 'accounting.reports' },
      { title: 'Profit & Loss', href: '/accounting/profit-loss', permission: 'accounting.reports' },
      { title: 'Balance Sheet', href: '/accounting/balance-sheet', permission: 'accounting.reports' },
      { title: 'General Ledger', href: '/accounting/general-ledger', permission: 'accounting.reports' },
      { title: 'Financial Years', href: '/accounting/financial-years', permission: 'accounting.view' },
    ],
  },
  {
    title: 'Reports', icon: FileBarChart, permission: 'reports.view',
    children: [
      { title: 'All Reports', href: '/reports', permission: 'reports.view' },
      { title: 'Sales Report', href: '/reports/sales', permission: 'reports.sales' },
      { title: 'Tax Summary', href: '/reports/tax', permission: 'reports.view' },
      { title: 'Inventory Report', href: '/reports/inventory', permission: 'reports.inventory' },
    ],
  },
  {
    title: 'Expenses', icon: Wallet, permission: 'expenses.view',
    children: [
      { title: 'All Expenses', href: '/expenses', permission: 'expenses.view' },
      { title: 'Categories', href: '/expenses/categories', permission: 'expenses.view' },
    ],
  },
  {
    title: 'Loans', icon: Landmark, permission: 'loans.view',
    children: [
      { title: 'All Loans', href: '/loans', permission: 'loans.view' },
      { title: 'Loan Parties', href: '/loans/parties', permission: 'loans.view' },
    ],
  },
  {
    title: 'Finance', icon: DollarSign, permission: 'pricing-tiers.view',
    children: [
      { title: 'Pricing Tiers', href: '/pricing-tiers', permission: 'pricing-tiers.view' },
    ],
  },
  {
    title: 'Administration', icon: Shield, permission: 'rbac.manage',
    children: [
      { title: 'Users', href: '/settings/users', permission: 'users.view' },
      { title: 'Roles', href: '/settings/roles', permission: 'rbac.manage' },
      { title: 'Activity Log', href: '/activity', permission: 'admin' },
    ],
  },
  {
    title: 'Settings', icon: Settings, permission: 'settings.view',
    children: [
      { title: 'General', href: '/settings', permission: 'settings.view' },
      { title: 'Currency & Regional', href: '/settings/locale', permission: 'settings.view' },
      { title: 'Offline Queue', href: '/settings/offline-queue', permission: 'settings.view' },
      { title: 'Backups', href: '/settings/backups', permission: 'settings.view' },
    ],
  },
];

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileToggle }: { collapsed: boolean; onToggle: () => void; mobileOpen?: boolean; onMobileToggle?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<string[]>(['Sales']);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    if (item.permission) return hasPermission(user, item.permission);
    if (item.children) return item.children.some((c) => !c.permission || hasPermission(user, c.permission));
    return true;
  }).map((item) => ({
    ...item,
    children: item.children?.filter((c) => {
      if (!user) return false;
      if (user.isSuperAdmin) return true;
      return !c.permission || hasPermission(user, c.permission);
    }),
  }));

  const toggleExpand = (title: string) => {
    setExpanded(prev =>
      prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]
    );
  };

  const isActive = (href?: string) => {
    if (!href || !mounted) return false;
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const isChildActive = (children?: NavItem[]) => {
    if (!children) return false;
    return children.some(c => isActive(c.href));
  };

  return (
    <>
      <aside className={cn(
        'fixed inset-y-0 left-0 z-30 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-accent transition-all duration-300',
        '-translate-x-full lg:translate-x-0',
        mobileOpen && 'translate-x-0',
        collapsed ? 'w-[70px]' : 'w-64'
      )}>
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-accent">
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2.5 font-semibold text-base">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Store className="h-4 w-4 text-primary-foreground" />
              </div>
              <span>Sitara ERP</span>
            </Link>
          )}
          <Button variant="ghost" size="icon" onClick={onToggle} className="hidden lg:inline-flex text-sidebar-foreground hover:bg-sidebar-accent h-8 w-8">
            <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
          </Button>
        </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-2 py-3">
        <nav className="space-y-0.5">
          {visibleItems.map((item) => {
            const active = isActive(item.href) || isChildActive(item.children);
            const open = expanded.includes(item.title);

            if (item.children) {
              return (
                <div key={item.title}>
                  <button
                    onClick={() => !collapsed && toggleExpand(item.title)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent',
                      active && 'bg-sidebar-accent text-primary',
                      collapsed && 'justify-center px-2'
                    )}
                    title={collapsed ? item.title : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left font-medium">{item.title}</span>
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
                      </>
                    )}
                  </button>
                  {!collapsed && open && (
                    <div className="ml-6 mt-0.5 space-y-0.5 border-l border-sidebar-accent pl-2">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href || '#'}
                          className={cn(
                            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-sidebar-accent',
                            isActive(child.href) ? 'bg-sidebar-accent text-primary font-medium' : 'text-sidebar-foreground/70'
                          )}
                        >
                          {child.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href || '#'}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent',
                  active && 'bg-sidebar-accent text-primary font-medium',
                  collapsed && 'justify-center px-2'
                )}
                title={collapsed ? item.title : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{item.title}</span>
                    {item.badge && (
                      <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">{item.badge}</span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      {!collapsed && (
        <div className="border-t border-sidebar-accent px-4 py-3">
          <p className="text-[10px] text-sidebar-foreground/40 text-center">Sitara ERP v0.1.0</p>
        </div>
      )}
    </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={onMobileToggle} />
      )}
    </>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();

  const mobileNavItems = [
    { title: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
    { title: 'POS', icon: ShoppingCart, href: '/pos' },
    { title: 'Sales', icon: ShoppingBag, href: '/sales' },
    { title: 'Customers', icon: Users, href: '/customers' },
    { title: 'More', icon: Menu, href: '#' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t bg-background py-2 lg:hidden">
      {mobileNavItems.map((item) => (
        <Link
          key={item.title}
          href={item.href}
          className={cn(
            'flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors',
            pathname.startsWith(item.href) ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          <item.icon className="h-5 w-5" />
          <span>{item.title}</span>
        </Link>
      ))}
    </nav>
  );
}
