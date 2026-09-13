'use client'; import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, ShoppingCart, Package, DollarSign, Users, CreditCard, Truck, FileText, Percent } from 'lucide-react';

const reports = [
  { title: 'Sales Report', desc: 'Revenue, profit, payment breakdown by date range', href: '/reports/sales', icon: BarChart3, color: 'text-emerald-600' },
  { title: 'Purchase Report', desc: 'Purchase orders by vendor, status, date range', href: '/reports/purchases', icon: ShoppingCart, color: 'text-blue-600' },
  { title: 'Inventory Report', desc: 'Stock levels, valuation, reorder alerts', href: '/reports/inventory', icon: Package, color: 'text-amber-600' },
  { title: 'Stock Valuation', desc: 'FIFO batch valuation by category', href: '/reports/stock-valuation', icon: DollarSign, color: 'text-purple-600' },
  { title: 'Customer Aging', desc: 'Outstanding credit balances by age', href: '/reports/customer-aging', icon: Users, color: 'text-red-600' },
  { title: 'Customers Report', desc: 'Customer sales, profit, and balances', href: '/reports/customers', icon: CreditCard, color: 'text-indigo-600' },
  { title: 'Expense Report', desc: 'Expenses by category, status, date range', href: '/reports/expenses', icon: FileText, color: 'text-orange-600' },
  { title: 'Vendors Report', desc: 'Vendor purchases, payments, payables', href: '/reports/vendors', icon: Truck, color: 'text-cyan-600' },
  { title: 'Tax Summary', desc: 'GST/VAT collected by tax rate and period', href: '/reports/tax', icon: Percent, color: 'text-green-600' },
];

export default function ReportsHub() {
  return (<div className="space-y-6">
    <PageHeader title="Reports" description="Business intelligence and analytics" />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {reports.map((r) => (
        <Card key={r.href} className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><r.icon className={`h-5 w-5 ${r.color}`} />{r.title}</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground mb-3">{r.desc}</p><div className="flex gap-2"><Button size="sm" variant="default" asChild><Link href={r.href}>View</Link></Button></div></CardContent>
        </Card>
      ))}
    </div>
  </div>);
}
