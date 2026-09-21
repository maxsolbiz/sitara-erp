'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, apiGet, getAccessToken } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { useAuth, hasPermission } from '@/lib/auth';
import { ColumnDef } from '@tanstack/react-table';
import { Package, Plus, Download, Upload, AlertTriangle, X, Clock } from 'lucide-react';

interface Product {
  id: string;
  sku: string;
  name: string;
  sellingPrice: number;
  costPrice: number;
  stock: number;
  category: string;
  isActive: boolean;
  barcode: string | null;
  reorderLevel: number;
  unitOfMeasure: string;
  createdAt: string;
}

interface ProductStats {
  totalProducts: number;
  activeProducts: number;
  totalStock: number;
  lowStock: number;
  outOfStock: number;
  stockValue: number;
}

export default function ProductsPage() {
  const { user } = useAuth();

  const columns: ColumnDef<Product>[] = [
    { accessorKey: 'name', header: 'Product', cell: ({ row }) => (
      <div>
        <Link href={`/products/${row.original.id}`} className="font-medium hover:text-primary">{row.original.name}</Link>
        <p className="text-xs text-muted-foreground">{row.original.sku}</p>
      </div>
    )},
    { accessorKey: 'category', header: 'Category' },
    { accessorKey: 'sellingPrice', header: 'Price', cell: ({ row }) => formatPkr(row.original.sellingPrice) },
    { accessorKey: 'stock', header: 'Stock', cell: ({ row }) => {
      const s = row.original.stock;
      const rl = row.original.reorderLevel;
      return (
        <span className={s === 0 ? 'text-red-600 font-bold' : s <= rl ? 'text-amber-600 font-medium' : 'text-emerald-600'}>
          {s} {row.original.unitOfMeasure}
        </span>
      );
    }},
    { accessorKey: 'isActive', header: 'Status', cell: ({ row }) => (
      <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
        {row.original.isActive ? 'Active' : 'Inactive'}
      </Badge>
    )},
    { id: 'actions', header: '', cell: ({ row }) => (
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" asChild><Link href={`/products/${row.original.id}`}>View</Link></Button>
        {hasPermission(user, 'products.update') && <Button variant="ghost" size="sm" asChild><Link href={`/products/${row.original.id}/edit`}>Edit</Link></Button>}
      </div>
    )},
  ];
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<ProductStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [downloading, setDownloading] = useState('');
  const [showHist, setShowHist] = useState(false); const [hist, setHist] = useState<any[] | null>(null); const [histErr, setHistErr] = useState('');

  const downloadFile = async (url: string, filename: string) => {
    setDownloading(url);
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${getAccessToken()}` } });
      if (!res.ok) return;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = blobUrl; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {} finally { setDownloading(''); }
  };

  const openHist = async () => { setShowHist(true); setHist(null); setHistErr(''); const r = await apiGet('/products/import/history').catch(() => null) as any; if (r?.data) setHist(r.data); else { setHist([]); setHistErr(r?.error?.detail || 'Could not load import history'); } };

async function load() {
    try {
      const [listRes, statsRes] = await Promise.all([
        apiGet('/products') as any,
        apiGet('/products/stats') as any,
      ]);
      if (listRes?.data) setProducts(listRes.data);
      if (statsRes?.data) setStats(statsRes.data);
    } catch (e) {}
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Products" description="Manage your product catalog">
        {hasPermission(user, 'products.export') && <Button variant="outline" size="sm" onClick={() => downloadFile('/api/v1/products/export', `products-export-${new Date().toISOString().slice(0,10)}.csv`)} disabled={!!downloading}><Download className="h-4 w-4 mr-1.5" />Export</Button>}
        {hasPermission(user, 'products.import') && <Button variant="outline" size="sm" onClick={() => { setShowImport(true); setImportResult(null); setImportFile(null); }}><Upload className="h-4 w-4 mr-1.5" />Import</Button>}
        {hasPermission(user, 'products.import') && <Button variant="outline" size="sm" onClick={openHist}><Clock className="h-4 w-4 mr-1.5" />History</Button>}
        {hasPermission(user, 'products.create') && <Button size="sm" asChild><Link href="/products/create"><Plus className="h-4 w-4 mr-1.5" />Add Product</Link></Button>}
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Total Products" value={stats?.totalProducts ?? (loading ? '...' : '0')} icon={Package} variant="primary" />
        <StatCard title="Total Stock" value={stats?.totalStock ?? (loading ? '...' : '0')} icon={Package} variant="success" />
        <StatCard title="Stock Value" value={stats ? formatPkr(stats.stockValue) : (loading ? '...' : formatPkr(0))} icon={Package} variant="info" />
        <StatCard title="Low Stock" value={stats?.lowStock ?? (loading ? '...' : '0')} icon={AlertTriangle} variant="warning" />
        <StatCard title="Out of Stock" value={stats?.outOfStock ?? (loading ? '...' : '0')} icon={AlertTriangle} variant="danger" />
        <StatCard title="Active" value={stats?.activeProducts ?? (loading ? '...' : '0')} icon={Package} variant="default" />
      </div>

      <DataTable
        columns={columns}
        data={products}
        loading={loading}
        searchKey="name"
        searchPlaceholder="Search products, SKU, barcode..."
      />

      {showHist && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowHist(false)}>
        <div className="bg-background rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg">Import History</h3><button aria-label="Close history" onClick={() => setShowHist(false)}><X className="h-4 w-4" /></button></div>
          {hist === null ? <p className="text-sm text-muted-foreground">Loading...</p> : histErr ? <p className="text-red-600 text-sm">{histErr}</p> : hist.length === 0 ? <p className="text-sm text-muted-foreground">No imports yet</p> : (<div className="max-h-80 overflow-y-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground border-b"><th className="py-1 pr-2">File</th><th className="pr-2">Date</th><th className="pr-2 text-right">Total</th><th className="pr-2 text-right">Imported</th><th className="pr-2 text-right">Skipped</th><th className="pr-2 text-right">Errors</th><th>Status</th></tr></thead><tbody>{hist.map((h: any) => (<tr key={h.id} className="border-b"><td className="py-1 pr-2 max-w-[10rem] truncate" title={h.filename}>{h.filename}</td><td className="pr-2">{new Date(h.createdAt).toLocaleString()}</td><td className="pr-2 text-right">{h.totalRows}</td><td className="pr-2 text-right">{h.imported}</td><td className="pr-2 text-right">{h.skipped}</td><td className="pr-2 text-right">{h.errors}</td><td>{h.status}</td></tr>))}</tbody></table></div>)}
        </div>
      </div>}
      {showImport && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => !importing && setShowImport(false)}>
        <div className="bg-background rounded-lg shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg">Import Products</h3><button onClick={() => !importing && setShowImport(false)}><X className="h-4 w-4" /></button></div>
          {!importResult ? (<div className="space-y-4">
            <p className="text-sm text-muted-foreground">Download the template first, fill it in, then upload.</p>
            {hasPermission(user, 'products.import') && <Button variant="outline" size="sm" onClick={() => downloadFile('/api/v1/products/import/template', 'products-import-template.csv')} disabled={!!downloading}><Download className="h-4 w-4 mr-1.5" />Download Template</Button>}
            <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30" onClick={() => document.getElementById('csv-file')?.click()}>
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">{importFile ? importFile.name : 'Click to select CSV file'}</p>
              <p className="text-xs text-muted-foreground">Maximum 5MB, .csv only</p>
              <input id="csv-file" type="file" accept=".csv" className="hidden" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
            </div>
            <Button className="w-full" disabled={!importFile || importing} onClick={async () => {
              if (!importFile) return; setImporting(true);
              const form = new FormData(); form.append('file', importFile);
              try {
                const res = await fetch('/api/v1/products/import', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }, body: form });
                const data = await res.json();
                setImportResult(data.data || data); setImporting(false); load();
              } catch (e: any) { setImportResult({ error: e.message }); setImporting(false); }
            }}>{importing ? 'Importing...' : 'Upload & Import'}</Button>
          </div>) : (
            <div className="space-y-3">
              {importResult.error ? <p className="text-red-600 text-sm">{importResult.error}</p> : <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-emerald-50 rounded-lg p-3"><p className="text-2xl font-bold text-emerald-700">{importResult.imported || 0}</p><p className="text-xs text-emerald-600">Imported</p></div>
                  <div className="bg-amber-50 rounded-lg p-3"><p className="text-2xl font-bold text-amber-700">{importResult.skipped || 0}</p><p className="text-xs text-amber-600">Skipped</p></div>
                  <div className="bg-gray-50 rounded-lg p-3"><p className="text-2xl font-bold">{importResult.total || 0}</p><p className="text-xs text-muted-foreground">Total</p></div>
                </div>
                {importResult.errors?.length > 0 && <div className="max-h-32 overflow-y-auto text-xs space-y-1">{importResult.errors.map((e: any, i: number) => <p key={i} className="text-amber-700">Row {e.row}: {e.reason}</p>)}</div>}
              </>}
              <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => { setShowImport(false); setImportResult(null); }}>Close</Button><Button className="flex-1" onClick={() => { setImportResult(null); setImportFile(null); }}>Import Another</Button></div>
            </div>
          )}
        </div>
      </div>}
    </div>
  );
}
