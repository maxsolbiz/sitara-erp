'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ShoppingCart, Package, TrendingUp, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const STATS = [
  { label: "Today's Sales", value: 'Rs. 0', change: '+0%', icon: ShoppingCart, positive: true },
  { label: 'Products', value: '0', change: '+0 this week', icon: Package, positive: true },
  { label: 'Revenue (MTD)', value: 'Rs. 0', change: '+0%', icon: TrendingUp, positive: true },
  { label: 'Receivables', value: 'Rs. 0', change: 'Rs. 0 overdue', icon: DollarSign, positive: false },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to Sitara ERP</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className={cn('text-xs flex items-center gap-1 mt-1', stat.positive ? 'text-green-600' : 'text-red-600')}>
                {stat.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {stat.change}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">No sales yet. Start by creating one from the POS.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Low Stock Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">No low stock alerts. All products are well-stocked.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}
