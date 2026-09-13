'use client';

import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  description?: string;
  trend?: { value: string; positive: boolean };
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  onClick?: () => void;
  className?: string;
}

const variantStyles = {
  default: 'bg-card',
  primary: 'bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border-blue-200 dark:border-blue-800',
  success: 'bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-200 dark:border-emerald-800',
  warning: 'bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-200 dark:border-amber-800',
  danger: 'bg-gradient-to-br from-red-500/10 via-red-500/5 to-transparent border-red-200 dark:border-red-800',
  info: 'bg-gradient-to-br from-cyan-500/10 via-cyan-500/5 to-transparent border-cyan-200 dark:border-cyan-800',
};

const iconVariantStyles = {
  default: 'text-muted-foreground',
  primary: 'text-blue-600 dark:text-blue-400',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
  info: 'text-cyan-600 dark:text-cyan-400',
};

export function StatCard({ title, value, icon: Icon, description, trend, variant = 'default', onClick, className }: StatCardProps) {
  return (
    <Card
      className={cn('relative overflow-hidden transition-all hover:shadow-md', variantStyles[variant], onClick && 'cursor-pointer', className)}
      onClick={onClick}
    >
      <CardContent className="p-4 lg:p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-xs lg:text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-xl lg:text-2xl font-bold tracking-tight">{value}</p>
            {trend && (
              <div className={cn('flex items-center gap-1 text-xs font-medium', trend.positive ? 'text-emerald-600' : 'text-red-600')}>
                {trend.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trend.value}
              </div>
            )}
            {description && !trend && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {Icon && (
            <div className={cn('rounded-lg p-2.5 bg-background/80 shadow-sm', iconVariantStyles[variant])}>
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
