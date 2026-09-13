'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { DiffViewer } from '@/components/diff-viewer';
import { format } from 'date-fns';
import { RefreshCw, Download, Search, X } from 'lucide-react';

interface LogEntry {
  id: string; userId: string | null; userName: string;
  action: string; entityType: string; entityId: string | null;
  description: string; ipAddress: string; createdAt: string;
  oldValues: Record<string, any> | null;
  newValues: Record<string, any> | null;
}

const actionColors: Record<string, string> = {
  CREATE: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
  UPDATE: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
  DELETE: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
  LOGIN: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300',
  LOGOUT: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
};

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [meta, setMeta] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filters, setFilters] = useState({ startDate: '', endDate: '', module: '', action: '' });

  const loadLogs = useCallback(async (p?: number) => {
    setLoading(true);
    let url = `/activity?page=${p || page}&perPage=20`;
    if (filters.startDate) url += `&startDate=${filters.startDate}`;
    if (filters.endDate) url += `&endDate=${filters.endDate}`;
    if (filters.module) url += `&module=${filters.module}`;
    if (filters.action) url += `&action=${filters.action}`;
    const res = await apiGet(url).catch(() => null);
    if (res?.data) { setLogs(res.data); setMeta(res.meta || {}); }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { loadLogs(page); }, [page, filters]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => loadLogs(), 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadLogs]);

  const applyFilters = () => { setPage(1); loadLogs(1); };
  const clearFilters = () => { setFilters({ startDate: '', endDate: '', module: '', action: '' }); setPage(1); };

  const handleExport = () => {
    const csv = [['Timestamp','User','Module','Action','Description','IP Address'].join(',')];
    for (const l of logs) csv.push([l.createdAt, l.userName, l.entityType, l.action, `"${l.description.replace(/"/g, '""')}"`, l.ipAddress].join(','));
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `activity-log-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (<div className="space-y-6">
    <PageHeader title="Activity Log" description="Track all system activity">
      <label className="flex items-center gap-2 text-sm cursor-pointer border rounded-md px-3 h-9 bg-background select-none">
        <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="rounded" />
        Auto-refresh (30s)
      </label>
      <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
      <Button variant="outline" size="sm" onClick={() => loadLogs()} disabled={loading}><RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
    </PageHeader>

    {/* Filters */}
    <div className="flex flex-wrap gap-2 items-end">
      <div className="space-y-1"><Label className="text-xs">Start Date</Label><Input type="date" className="h-8 text-sm w-36" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} /></div>
      <div className="space-y-1"><Label className="text-xs">End Date</Label><Input type="date" className="h-8 text-sm w-36" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} /></div>
      <div className="space-y-1"><Label className="text-xs">Module</Label>
        <select className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm w-32" value={filters.module} onChange={(e) => setFilters({ ...filters, module: e.target.value })}>
          <option value="">All</option>
          <option value="product">Products</option>
          <option value="customer">Customers</option>
          <option value="vendor">Vendors</option>
          <option value="sale">Sales</option>
          <option value="purchase">Purchases</option>
          <option value="inventory">Inventory</option>
          <option value="settings">Settings</option>
          <option value="auth">Auth</option>
        </select>
      </div>
      <div className="space-y-1"><Label className="text-xs">Action</Label>
        <select className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm w-28" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}>
          <option value="">All</option>
          <option value="CREATE">Create</option>
          <option value="UPDATE">Update</option>
          <option value="DELETE">Delete</option>
          <option value="LOGIN">Login</option>
          <option value="LOGOUT">Logout</option>
        </select>
      </div>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={applyFilters}>Filter</Button>
      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clearFilters}><X className="h-3 w-3 mr-1" />Clear</Button>
    </div>

    {/* Table */}
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50 text-left">
              <th className="p-3 font-medium">Timestamp</th>
              <th className="p-3 font-medium">User</th>
              <th className="p-3 font-medium">Module</th>
              <th className="p-3 font-medium">Action</th>
              <th className="p-3 font-medium">Description</th>
              <th className="p-3 font-medium">IP Address</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
              : logs.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No activity found</td></tr>
               : logs.map((l) => (
                <React.Fragment key={l.id}>
                  <tr className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}>
                    <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">{format(new Date(l.createdAt), 'MMM d, HH:mm')}</td>
                    <td className="p-3 font-medium">{l.userName}</td>
                    <td className="p-3"><Badge variant="outline" className="text-[10px]">{l.entityType}</Badge></td>
                    <td className="p-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${actionColors[l.action] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>{l.action}</span></td>
                    <td className="p-3 text-muted-foreground max-w-xs truncate">{l.description}</td>
                    <td className="p-3 text-xs text-muted-foreground font-mono">{l.ipAddress}</td>
                  </tr>
                  {expandedId === l.id && (
                    <tr key={`${l.id}-diff`}>
                      <td colSpan={6} className="p-0">
                        <div className="p-4 bg-muted/20 border-t">
                          <DiffViewer oldValues={l.oldValues || null} newValues={l.newValues || null} />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    {/* Pagination */}
    {meta?.totalPages > 1 && (
      <div className="flex justify-between items-center text-xs">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span className="text-muted-foreground">Page {page} of {meta.totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    )}
  </div>);
}
