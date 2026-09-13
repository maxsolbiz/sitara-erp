'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';

const ROUTE_LABELS: Record<string, string> = {
  dashboard:   'Dashboard',
  customers:   'Customers',
  vendors:     'Vendors',
  products:    'Products',
  sales:       'Sales',
  purchases:   'Purchases',
  pos:         'Point of Sale',
  inventory:   'Inventory',
  reports:     'Reports',
  settings:    'Settings',
  activity:    'Activity Log',
  aging:       'AR Aging',
  transfers:   'Stock Transfers',
  create:      'New',
  edit:        'Edit',
  ledger:      'Ledger',
  statement:   'Statement',
  'print-ledger':  'Print Ledger',
  'print-receipt': 'Print Receipt',
  'barcode-labels': 'Barcode Labels',
  tax:         'Tax Report',
  backup:      'Backup & Restore',
  sessions:    'Sessions',
};

interface BreadcrumbProps {
  dynamicLabels?: Record<string, string>;
}

export function Breadcrumb({ dynamicLabels = {} }: BreadcrumbProps) {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const crumbs = segments.map((seg, i) => {
    const href = '/' + segments.slice(0, i + 1).join('/');
    const label = dynamicLabels[seg]
      || ROUTE_LABELS[seg]
      || (seg.match(/^\d+$/) ? `#${seg}` : seg.charAt(0).toUpperCase() + seg.slice(1));
    return { href, label, isLast: i === segments.length - 1 };
  });
  if (crumbs.length <= 1) return null;
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
      <Link href="/dashboard" className="hover:text-foreground transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 opacity-50" />
          {crumb.isLast ? (
            <span className="text-foreground font-medium">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="hover:text-foreground transition-colors">{crumb.label}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}
