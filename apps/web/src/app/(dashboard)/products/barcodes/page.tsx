'use client'; import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/page-header'; import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input'; import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch'; import { apiGet, getAccessToken } from '@/lib/api';
import { Search, Plus, X, Loader2, Printer, Barcode } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

interface ProductResult { id: number; name: string; sku: string; barcode: string | null; sellingPrice: string; }

interface SelectedProduct extends ProductResult { quantity: number; }

export default function BarcodesPage() {
  const [query, setQuery] = useState(''); const [results, setResults] = useState<ProductResult[]>([]);
  const [searching, setSearching] = useState(false); const [selected, setSelected] = useState<SelectedProduct[]>([]);
  const [generating, setGenerating] = useState(false);
  const [labelSize, setLabelSize] = useState('50x30'); const [columns, setColumns] = useState('3');
  const [showName, setShowName] = useState(true); const [showSku, setShowSku] = useState(true);
  const [showPrice, setShowPrice] = useState(true);

  const search = useCallback(async (q: string) => {
    if (q.length < 1) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await apiGet(`/products/search?q=${encodeURIComponent(q)}`) as any;
      if (res?.data) setResults(res.data);
    } catch {} finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const toggleProduct = (p: ProductResult) => {
    setSelected(prev =>
      prev.some(s => s.id === p.id) ? prev.filter(s => s.id !== p.id) : [...prev, { ...p, quantity: 1 }]
    );
  };

  const updateQty = (id: number, qty: number) => {
    setSelected(prev => prev.map(s => s.id === id ? { ...s, quantity: Math.max(1, qty) } : s));
  };

  const removeSelected = (id: number) => {
    setSelected(prev => prev.filter(s => s.id !== id));
  };

  const generateLabels = async () => {
    if (selected.length === 0) { toast.error('Select at least one product'); return; }
    setGenerating(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/products/barcode-labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          products: selected.map(s => ({ id: s.id, name: s.name, sku: s.sku, barcode: s.barcode, sellingPrice: s.sellingPrice, quantity: s.quantity })),
          labelSize, columns: Number(columns), showName, showSku, showPrice,
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ detail: 'Generation failed' })); toast.error(err.detail); return; }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = blobUrl; a.download = 'barcode-labels.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast.success('Labels generated successfully');
    } catch (err: any) { toast.error(err.message || 'Failed to generate labels'); }
    finally { setGenerating(false); }
  };

  return (<div className="space-y-6">
    <PageHeader title="Barcode Labels" description="Generate and print barcode labels">
      <Button onClick={generateLabels} disabled={generating || selected.length === 0}>
        {generating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Printer className="h-4 w-4 mr-1.5" />}
        {generating ? 'Generating...' : 'Generate Labels'}
      </Button>
    </PageHeader>

    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Search Products</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search by name or SKU..." className="pl-9"
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {results.length > 0 && <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
              {results.map(p => {
                const isSelected = selected.some(s => s.id === p.id);
                return (<div
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent text-sm ${isSelected ? 'bg-accent/50' : ''}`}
                  onClick={() => toggleProduct(p)}
                >
                  <input type="checkbox" checked={isSelected} readOnly className="h-4 w-4 rounded border-gray-300" />
                  <Barcode className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">SKU: {p.sku}{p.barcode ? ` | ${p.barcode}` : ''}</div>
                  </div>
                  {isSelected ? <X className="h-4 w-4 text-muted-foreground shrink-0" onClick={(e) => { e.stopPropagation(); removeSelected(p.id); }} /> : <Plus className="h-4 w-4 text-muted-foreground shrink-0" />}
                </div>);
              })}
            </div>}
            {query && !searching && results.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No products found</p>}
          </CardContent>
        </Card>

        {selected.length > 0 && <Card>
          <CardHeader><CardTitle className="text-sm">Selected Products ({selected.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {selected.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-2 border rounded-md">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.sku}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number" min={1} value={p.quantity}
                    onChange={e => updateQty(p.id, parseInt(e.target.value) || 1)}
                    className="w-16 h-8 text-sm"
                  />
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeSelected(p.id)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Label Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Label Size</Label>
              <Select value={labelSize} onValueChange={setLabelSize}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="50x30">50 × 30 mm</SelectItem>
                  <SelectItem value="40x25">40 × 25 mm</SelectItem>
                  <SelectItem value="60x40">60 × 40 mm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Columns</Label>
              <Select value={columns} onValueChange={setColumns}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="4">4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer">Show Name</Label>
              <Switch checked={showName} onCheckedChange={setShowName} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer">Show SKU</Label>
              <Switch checked={showSku} onCheckedChange={setShowSku} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer">Show Price</Label>
              <Switch checked={showPrice} onCheckedChange={setShowPrice} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>);
}
