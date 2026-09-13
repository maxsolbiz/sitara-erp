'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, ShoppingCart, Minus, Plus, Trash2, X, Check, Printer, RotateCcw, Clock, User as UserIcon, Percent, Ban, AlertTriangle, WifiOff, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { queueSale, cacheProducts, getCachedProducts, cacheCustomers, getCachedCustomers } from '@/lib/offline-db';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';

interface CartItem {
  productId: number; name: string; sku: string; quantity: number;
  unitPrice: number; lineTotal: number; stock: number; tierDiscount?: number;
}

export default function PosPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState(0);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paidAmount, setPaidAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [creditPaidAmount, setCreditPaidAmount] = useState(0);
  const [paymentReference, setPaymentReference] = useState('');
  const [heldSales, setHeldSales] = useState<any[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('percent');
  const [discountValue, setDiscountValue] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Return state
  const [showReturn, setShowReturn] = useState(false);
  const [returnStep, setReturnStep] = useState(1);
  const [customerPurchases, setCustomerPurchases] = useState<any[]>([]);
  const [purchasesMeta, setPurchasesMeta] = useState<any>({});
  const [returnItems, setReturnItems] = useState<any[]>([]);
  const [returnPage, setReturnPage] = useState(1);
  const [returnReason, setReturnReason] = useState('defective');
  const [refundMethod, setRefundMethod] = useState('cash');
  const [returnNotes, setReturnNotes] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [overrideForm, setOverrideForm] = useState({ username: '', password: '' });
  const [overrideApproved, setOverrideApproved] = useState<any>(null);
  const [walkInCustomer, setWalkInCustomer] = useState<any>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [mobileTab, setMobileTab] = useState<'products'|'cart'>('products');
  const barcodeRef = useRef<HTMLInputElement>(null);
  const custSearchRef = useRef<HTMLInputElement>(null);
  const { isOnline, pendingCount } = useOfflineStatus();

  const subtotal = cart.filter(i => i.quantity > 0).reduce((s, i) => s + i.lineTotal, 0);
  const returnTotal = cart.filter(i => i.quantity < 0).reduce((s, i) => s + i.lineTotal, 0);
  const discount = discountType === 'fixed' ? discountValue : (discountValue > 0 ? subtotal * (discountValue / 100) : 0);
  const total = Math.max(0, subtotal - discount + returnTotal);
  const creditPortion = Math.max(0, total - creditPaidAmount);
  const change = paidAmount > total ? paidAmount - total : 0;
  const shortfall = paidAmount > 0 && paidAmount < total ? total - paidAmount : 0;
  const availableCredit = customer ? (customer.creditLimit || 0) - (customer.currentBalance || 0) : 0;

  // Clear manager override when payment method changes or checkout closes
  useEffect(() => {
    setOverrideApproved(null);
    setOverrideForm({ username: '', password: '' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, showCheckout]);

  // Initialize POS data (once on mount)
  useEffect(() => {
    loadPOSData();
  }, []);

  // Prefetch data for offline cache
  useEffect(() => {
    const prefetch = async () => {
      try {
        const res = await fetch('/api/products?perPage=1000&isActive=true');
        if (res.ok) { const data = await res.json(); if (data.data) await cacheProducts(data.data); }
      } catch { console.log('[POS] Products prefetch failed'); }
      try {
        const cRes = await fetch('/api/customers?perPage=1000&isActive=true');
        if (cRes.ok) { const cData = await cRes.json(); if (cData.data) await cacheCustomers(cData.data); }
      } catch { console.log('[POS] Customers prefetch failed'); }
    };
    prefetch();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); barcodeRef.current?.focus(); }
      if (e.key === 'F2') { e.preventDefault(); setShowDiscount(true); }
      if (e.key === 'F3') { e.preventDefault(); holdSale(); }
      if (e.key === 'F4') { e.preventDefault(); if (cart.length > 0) setShowCheckout(true); }
      if (e.key === 'F5') { e.preventDefault(); confirmNewSale(); }
      if (e.key === 'F6') { e.preventDefault(); openReturnModal(); }
      if (e.key === 'F8') { e.preventDefault(); setShowShortcuts(!showShortcuts); }
      if (e.key === 'Escape') { setShowCheckout(false); setShowHeld(false); setShowDiscount(false); setShowSuccess(false); }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [cart.length, showShortcuts]);

  const loadPOSData = async () => {
    const [initRes, heldRes] = await Promise.all([
      apiGet('/pos/init').catch(() => null),
      apiGet('/pos/held-sales').catch(() => null),
    ]);
    if (initRes?.data) {
      setProducts(initRes.data.products || []);
      setCategories(initRes.data.categories || []);
      if (initRes.data.walkInCustomer) {
        setWalkInCustomer(initRes.data.walkInCustomer);
        if (!customer) setCustomer(initRes.data.walkInCustomer);
      }
    }
    if (heldRes?.data) setHeldSales(heldRes.data);
  };

  // Customer search with debounce
  useEffect(() => {
    if (customerSearch.length < 2) {
      setCustomerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await apiGet(`/customers/search?q=${customerSearch}`).catch(() => null);
      if (res?.data) setCustomerResults(res.data);
    }, 200);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const loadAllCustomers = async () => {
    const res = await apiGet('/customers/search?q=').catch(() => null);
    if (res?.data) { setCustomerResults(res.data); setShowCustomerDropdown(true); }
  };

  const selectCustomer = (c: any) => {
    setCustomer(c);
    setCustomerSearch('');
    setCustomerResults([]);
    setShowCustomerDropdown(false);
  };

  const newSale = () => {
    setCart([]);
    setDiscountValue(0);
    setDiscountType('percent');
    setPaidAmount(0);
    setCreditPaidAmount(0);
    setPaymentReference('');
    setShowSuccess(false);
    setLastSale(null);
    clearOverride();
    setShowClearConfirm(false);
    barcodeRef.current?.focus();
  };

  const confirmNewSale = () => {
    if (cart.length > 0) setShowClearConfirm(true);
    else newSale();
  };

  const holdSale = async () => {
    if (cart.length === 0) { toast.error('Cart is empty'); return; }
    try {
      const res = await apiPost('/pos/hold', {
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
        customerId: customer?.id || null,
      }) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      toast.success('Sale held');
      newSale();
      const held = await apiGet('/pos/held-sales').catch(() => null);
      if (held?.data) setHeldSales(held.data);
    } catch (e: any) { toast.error(e.message); }
  };

  const resumeSale = async (saleId: string) => {
    try {
      const res = await apiPost(`/pos/resume/${saleId}`, {}) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      if (res.data?.sale) {
        setCart(res.data.sale.items.map((i: any) => ({
          productId: Number(i.productId), name: i.productName || `Item`, sku: '',
          quantity: i.quantity, unitPrice: Number(i.unitPrice),
          lineTotal: Number(i.unitPrice) * i.quantity, stock: 999,
        })));
        toast.success('Sale resumed');
      }
      setShowHeld(false);
      const held = await apiGet('/pos/held-sales').catch(() => null);
      if (held?.data) setHeldSales(held.data);
    } catch (e: any) { toast.error(e.message); }
  };

  const addToCart = useCallback((product: any) => {
    if (product.stock === 0) { toast.error('Out of stock'); return; }
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) return prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1, lineTotal: (i.quantity + 1) * i.unitPrice } : i);
      return [...prev, { productId: product.id, name: product.name, sku: product.sku || '', quantity: 1, unitPrice: Number(product.sellingPrice || 0), lineTotal: Number(product.sellingPrice || 0), stock: product.stock || 0 }];
    });
    if (typeof window !== 'undefined' && window.innerWidth < 1024) setMobileTab('cart');
  }, [setMobileTab]);

  const updateQty = (productId: number, delta: number) => {
    setCart((prev) => prev.map((i) => {
      if (i.productId !== productId) return i;
      const newQty = Math.max(1, i.quantity + delta);
      return { ...i, quantity: newQty, lineTotal: newQty * i.unitPrice };
    }));
  };

  const removeItem = (productId: number) => setCart((prev) => prev.filter((i) => i.productId !== productId));

  const handleBarcodeSearch = async (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !search.trim()) return;
    const res = await apiGet(`/products/search?q=${search}`).catch(() => null);
    if (res?.data?.length > 0) { addToCart(res.data[0]); setSearch(''); setSearchResults([]); barcodeRef.current?.focus(); }
    else toast.error('Product not found');
  };

  const handleCheckout = async () => {
    if (cart.length === 0) { toast.error('Cart is empty'); return; }
    if (!customer) { toast.error('Select a customer'); return; }
    if (paymentMethod === 'CASH' && paidAmount > 0 && paidAmount < total) {
      toast.error(`Short by ${formatPkr(shortfall)}`); return;
    }
    setSaving(true);
    const paymentsPayload = paymentMethod === 'CREDIT'
      ? [
          ...(creditPaidAmount > 0 ? [{ method: 'CASH', amount: creditPaidAmount }] : []),
          ...(creditPortion > 0 ? [{ method: 'CREDIT', amount: creditPortion, referenceNumber: paymentReference || undefined }] : []),
        ]
      : [{ method: paymentMethod, amount: total, referenceNumber: paymentReference || undefined }];
    const checkoutBody: any = {
      items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, discountAmount: 0 })),
      payments: paymentsPayload,
      customerId: customer?.customerCode !== 'WALKIN' ? Number(customer.id) : undefined,
      discount,
    };
    if (overrideApproved) {
      checkoutBody.managerOverride = overrideForm;
    }
    if (!navigator.onLine) {
      // Offline — queue sale locally
      try {
        const id = await queueSale(checkoutBody);
        setLastSale({ saleNumber: `OFFLINE-${id.slice(0, 8)}`, total });
        setShowCheckout(false);
        setShowSuccess(true);
        setCart([]);
        setPaidAmount(0);
        setDiscountValue(0);
        toast.success('Sale saved offline — will sync when online');
        barcodeRef.current?.focus();
      } catch (e: any) { toast.error(e.message); }
      setSaving(false);
      return;
    }
    try {
      const res = await apiPost('/pos/checkout', checkoutBody) as any;
      if (res.error) { toast.error(res.error.detail); setSaving(false); return; }
      setLastSale(res.data);
      setShowCheckout(false);
      setShowSuccess(true);
      setCart([]);
      setPaidAmount(0);
      setDiscountValue(0);
      loadPOSData();
      barcodeRef.current?.focus();
    } catch (e: any) {
      // Network failure — fall back to offline queue
      try {
        const id = await queueSale(checkoutBody);
        setLastSale({ saleNumber: `OFFLINE-${id.slice(0, 8)}`, total });
        setShowCheckout(false);
        setShowSuccess(true);
        setCart([]);
        setPaidAmount(0);
        setDiscountValue(0);
        toast.success('Sale saved offline — will sync when online');
        barcodeRef.current?.focus();
      } catch (qErr: any) { toast.error(qErr.message); }
    }
    setSaving(false);
  };

  // Return functions
  const openReturnModal = () => {
    if (!customer) { toast.error('Select a customer first'); return; }
    if (customer.customerCode === 'WALKIN') { toast.error('Walk-in customers are not eligible for returns'); return; }
    setReturnStep(1);
    setReturnItems([]);
    setReturnPage(1);
    setShowReturn(true);
    loadCustomerPurchases(1);
  };

  const loadCustomerPurchases = async (page: number) => {
    if (!customer) return;
    const res = await apiGet(`/pos/customer-purchases?customer_id=${customer.id}&page=${page}`).catch(() => null);
    if (res?.data) setCustomerPurchases(res.data);
    if (res?.meta) setPurchasesMeta(res.meta);
    setReturnPage(page);
  };

  const addReturnItem = (productId: number, saleItemId: string, productName: string, unitPrice: number, maxQty: number, saleNumber: string) => {
    if (returnItems.find((i) => i.saleItemId === saleItemId)) { toast.error('Item already added'); return; }
    setReturnItems([...returnItems, { productId, saleItemId, productName, unitPrice, maxQty, qty: 1, saleNumber }]);
  };

  const updateReturnQty = (index: number, delta: number) => {
    setReturnItems((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      const newQty = Math.max(1, Math.min(item.qty + delta, item.maxQty));
      return { ...item, qty: newQty };
    }));
  };

  const removeReturnItem = (index: number) => setReturnItems((prev) => prev.filter((_, i) => i !== index));

  const submitReturn = async () => {
    if (returnItems.length === 0) { toast.error('Select items to return'); return; }
    const total = returnItems.reduce((s, i) => s + (i.unitPrice * i.qty), 0);

    // If cart has items, add return items as negative cart lines
    if (cart.length > 0) {
      const returnCartItems = returnItems.map((ri) => ({
        productId: ri.productId, name: ri.productName, sku: '', quantity: -ri.qty,
        unitPrice: ri.unitPrice, lineTotal: -(ri.unitPrice * ri.qty), stock: 999,
      }));
      setCart([...cart, ...returnCartItems]);
      setShowReturn(false);
      toast.success(`Return of ${formatPkr(total)} applied to current sale`);
      return;
    }

    // Standalone return
    setSaving(true);
    try {
      const res = await apiPost('/pos/process-return', {
        customerId: Number(customer.id),
        items: returnItems.map((i) => ({ saleItemId: i.saleItemId, quantity: i.qty, unitPrice: i.unitPrice })),
        reason: returnReason,
        refundMethod,
        notes: returnNotes,
      }) as any;
      if (res.error) { toast.error(res.error.detail); setSaving(false); return; }
      toast.success(`Return ${res.data.returnNumber} submitted`);
      setShowReturn(false);
      setReturnItems([]);
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const validateManagerOverride = async () => {
    if (!overrideForm.username || !overrideForm.password) { toast.error('Enter username and password'); return; }
    try {
      const res = await apiPost('/pos/validate-manager', overrideForm) as any;
      if (res.error) { toast.error(res.error.detail); return; }
      setOverrideApproved(res.data);
      setShowOverride(false);
      toast.success(`Override approved by ${res.data.fullName}`);
    } catch (e: any) { toast.error(e.message); }
  };

  const clearOverride = () => {
    setOverrideApproved(null);
    setOverrideForm({ username: '', password: '' });
  };

  const printReceipt = () => {
    if (!lastSale) return;
    window.open(`/receipt/${lastSale.saleId}`, '_blank');
  };

  return (
    <div className="fixed inset-0 top-0 left-0 z-50 flex flex-col bg-background lg:static lg:z-auto" style={{ minHeight: '100vh' }}>
      {/* Top Bar */}
      <header className="flex items-center justify-between border-b px-4 py-2 bg-card shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <span className="font-bold hidden sm:inline">Point of Sale</span>
          {!isOnline && <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full"><WifiOff className="h-3 w-3" />Offline</span>}
          {isOnline && pendingCount > 0 && <span className="inline-flex items-center gap-1 text-xs text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full"><RefreshCw className="h-3 w-3" />{pendingCount} pending</span>}
        </div>
        <div className="flex items-center gap-2">
          <Input ref={barcodeRef} placeholder="Scan barcode or search... (F1)" value={search}
            onChange={(e) => { setSearch(e.target.value); if (e.target.value.length > 1) { apiGet(`/products/search?q=${e.target.value}`).then((r: any) => { if (r?.data) setSearchResults(r.data); }); } else setSearchResults([]); }}
            onKeyDown={handleBarcodeSearch} className="h-8 w-48 md:w-72 text-sm" />
          <span className="hidden md:inline text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">F1</span>
        </div>
      </header>

      {/* Mobile tab switcher */}
      <div className="flex lg:hidden border-b shrink-0">
        <button
          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${mobileTab === 'products' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
          onClick={() => setMobileTab('products')}>
          Products {cart.length > 0 && <span className="ml-1 bg-primary text-primary-foreground rounded-full px-1.5 text-xs">{cart.length}</span>}
        </button>
        <button
          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${mobileTab === 'cart' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
          onClick={() => setMobileTab('cart')}>
          Cart {cart.length > 0 && <span className="ml-1 bg-primary text-primary-foreground rounded-full px-1.5 text-xs">{cart.length}</span>}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <div className={`flex-1 flex-col overflow-hidden border-r ${mobileTab === 'products' ? 'flex' : 'hidden'} lg:flex`}>
          {/* Categories */}
          <div className="flex gap-1 overflow-x-auto p-2 border-b shrink-0 bg-muted/30">
            <Button size="sm" variant={activeCategory === 0 ? 'default' : 'ghost'} onClick={() => setActiveCategory(0)} className="h-7 text-xs shrink-0">All</Button>
            {categories.map((c: any) => (
              <Button key={c.id} size="sm" variant={activeCategory === c.id ? 'default' : 'ghost'} onClick={() => {
                setActiveCategory(c.id);
                apiGet(`/pos/products-by-category?category_id=${c.id}`).then((r: any) => {
                  if (r?.data) setProducts(r.data);
                }).catch(() => {});
              }} className="h-7 text-xs shrink-0">{c.name}</Button>
            ))}
          </div>
          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {products.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase())).map((p) => (
                <button key={p.id} onClick={() => addToCart(p)} disabled={p.stock === 0}
                  className={`relative flex flex-col items-center justify-center rounded-lg border p-2 text-center transition-all hover:shadow-md hover:border-primary min-h-[44px] ${p.stock === 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <div className="h-12 w-12 rounded-md bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-lg font-bold text-primary mb-1">
                    {p.name?.charAt(0)}
                  </div>
                  <p className="text-[10px] font-medium leading-tight line-clamp-2">{p.name}</p>
                  <p className="text-xs font-bold text-primary mt-0.5">{formatPkr(Number(p.sellingPrice))}</p>
                  {p.stock !== undefined && (
                    <span className={`absolute top-1 right-1 text-[8px] font-bold px-1 rounded ${p.stock <= 0 ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' : p.stock <= 5 ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'}`}>
                      {p.stock}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className={`w-80 lg:w-96 flex-col bg-card shrink-0 ${mobileTab === 'cart' ? 'flex' : 'hidden'} lg:flex`}>
          {/* Customer */}
          <div className="border-b p-3 space-y-2">
            <div className="relative">
              <Input ref={custSearchRef} placeholder="Search customer..." value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                onFocus={() => { setShowCustomerDropdown(true); if (!customerSearch) loadAllCustomers(); }}
                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                className="h-8 text-sm" />
              {showCustomerDropdown && customerResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-lg border bg-popover shadow-xl max-h-48 overflow-y-auto">
                  {customerResults.map((c: any) => (
                    <button key={c.id} className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 border-b last:border-0"
                      onMouseDown={() => selectCustomer(c)}>
                      <UserIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{c.fullName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {c.phone || ''}
                          {c.creditLimit > 0 && ` | Credit: ${formatPkr(c.creditLimit - (c.currentBalance || 0))}`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {customer && (
              <div className="flex items-center justify-between rounded-lg border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{customer.fullName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {customer.phone && `${customer.phone} | `}
                    {customer.creditLimit > 0 ? `Credit: ${formatPkr(customer.creditLimit - (customer.currentBalance || 0))}` : ''}
                  </p>
                  {customer.pricingTier && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 dark:bg-purple-900 px-2 py-0.5 text-[9px] font-medium text-purple-700 dark:text-purple-300 mt-1">
                      {customer.pricingTier.name} — {customer.pricingTier.discountPercent}% off
                    </span>
                  )}
                </div>
                <button onClick={() => setCustomer(walkInCustomer)} className="text-muted-foreground hover:text-foreground shrink-0 ml-2" title="Clear to walk-in customer"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mb-2 opacity-20" />
                <p className="text-sm font-medium">Cart is empty</p>
                <p className="text-xs">Scan or search products (F1)</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.productId} className="flex items-center gap-2 rounded-lg border p-2 hover:bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">{formatPkr(item.unitPrice)} each</p>
                  </div>
                  <div className="flex items-center gap-0.5 border rounded">
                    <button onClick={() => updateQty(item.productId, -1)} className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-muted rounded-l"><Minus className="h-3 w-3" /></button>
                    <span className="w-7 text-center text-xs font-medium">{item.quantity}</span>
                    <button onClick={() => updateQty(item.productId, 1)} className="min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-muted rounded-r"><Plus className="h-3 w-3" /></button>
                  </div>
                  <p className="text-xs font-bold w-16 text-right">{formatPkr(item.lineTotal)}</p>
                  <button onClick={() => removeItem(item.productId)} className="min-h-[44px] min-w-[44px] rounded flex items-center justify-center hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                </div>
              ))
            )}
          </div>

          {/* Summary + Actions */}
          <div className="border-t p-3 space-y-2 bg-muted/20">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatPkr(subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Discount</span><span className="text-red-600">-{formatPkr(discount)}</span></div>}
            <div className="flex justify-between text-lg font-bold border-t pt-2"><span>Total</span><span className="text-primary">{formatPkr(total)}</span></div>
            <div className="grid grid-cols-5 gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setShowDiscount(true)} className="min-h-[44px] h-8 text-xs"><Percent className="h-3 w-3 mr-1" />Disc</Button>
              <Button variant="outline" size="sm" onClick={confirmNewSale} className="min-h-[44px] h-8 text-xs text-red-500 hover:text-red-700"><Trash2 className="h-3 w-3 mr-1" />Clear</Button>
              <Button variant="outline" size="sm" onClick={holdSale} className="min-h-[44px] h-8 text-xs"><Clock className="h-3 w-3 mr-1" />Hold</Button>
              <Button variant="outline" size="sm" onClick={() => setShowHeld(true)} className="min-h-[44px] h-8 text-xs relative">
                <RotateCcw className="h-3 w-3 mr-1" />Held
                {heldSales.length > 0 && <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[8px] rounded-full h-4 w-4 flex items-center justify-center">{heldSales.length}</span>}
              </Button>
              <Button variant="outline" size="sm" onClick={openReturnModal}
                disabled={!customer || customer.customerCode === 'WALKIN'}
                className="min-h-[44px] h-8 text-xs"><Ban className="h-3 w-3 mr-1" />Return</Button>
            </div>
            <Button className="w-full lg:w-auto min-h-[44px] h-10 text-sm font-semibold" disabled={cart.length === 0}
              onClick={() => { if (!customer) { toast.error('Select a customer'); return; } setShowCheckout(true); }}>
              <ShoppingCart className="h-4 w-4 mr-2" /> Checkout (F4)
            </Button>
          </div>
        </div>
      </div>

      {/* Discount Modal */}
      <Dialog open={showDiscount} onOpenChange={setShowDiscount}>
        <DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>Apply Discount</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant={discountType === 'percent' ? 'default' : 'outline'} size="sm" onClick={() => setDiscountType('percent')} className="flex-1">Percentage</Button>
              <Button variant={discountType === 'fixed' ? 'default' : 'outline'} size="sm" onClick={() => setDiscountType('fixed')} className="flex-1">Fixed Amount</Button>
            </div>
            <Input type="number" placeholder={discountType === 'percent' ? 'Discount %' : 'Amount (PKR)'} value={discountValue || ''} onChange={(e) => setDiscountValue(Number(e.target.value))} />
            <Button className="w-full" onClick={() => { setShowDiscount(false); toast.success('Discount applied'); }}>Apply Discount</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Checkout Modal */}
      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Complete Sale</DialogTitle></DialogHeader>
          <div className="text-center py-3 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg mb-3">
            <p className="text-3xl font-bold text-primary">{formatPkr(total)}</p>
            <p className="text-sm text-muted-foreground">Total Due</p>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              { key: 'CASH', label: 'Cash' }, { key: 'CARD', label: 'Card' },
              { key: 'BANK_TRANSFER', label: 'Bank Transfer' }, { key: 'CREDIT', label: 'Credit' },
            ].map((m) => (
              <button key={m.key} onClick={() => setPaymentMethod(m.key)}
                className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm transition-all ${paymentMethod === m.key ? 'border-primary bg-primary/5 ring-2 ring-primary font-medium' : 'hover:border-muted-foreground'}`}>
                {m.label} {paymentMethod === m.key && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
          {paymentMethod === 'CASH' && (
            <div className="space-y-2">
              <div className="flex gap-2">{['500','1000','2000','5000'].map((a) => (
                <Button key={a} variant="outline" size="sm" onClick={() => setPaidAmount((prev) => prev + Number(a))} className="flex-1 h-8 text-xs">{formatPkr(Number(a))}</Button>
              ))}</div>
              <Input type="number" placeholder="Amount received" value={paidAmount || ''} onChange={(e) => setPaidAmount(Number(e.target.value))} className="text-lg font-bold text-center h-10" />
              {paidAmount >= total ? (
                <p className="text-sm text-emerald-600 font-medium text-center bg-emerald-50 dark:bg-emerald-950 py-2 rounded">Change: {formatPkr(change)}</p>
              ) : paidAmount > 0 ? (
                <p className="text-sm text-red-600 font-medium text-center bg-red-50 dark:bg-red-950 py-2 rounded">Short: {formatPkr(shortfall)}</p>
              ) : null}
            </div>
          )}
          {(paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER') && (
            <div className="space-y-2">
              <Input type="number" placeholder="Amount" value={paidAmount || ''} onChange={(e) => setPaidAmount(Number(e.target.value))} className="text-lg font-bold text-center h-10" />
              <Input placeholder="Reference / Transaction ID" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="text-sm h-9" />
              {paymentReference && (
                <p className="text-xs text-emerald-600 text-center">Reference saved for reconciliation</p>
              )}
            </div>
          )}
          {paymentMethod === 'CREDIT' && customer && (
            <>
              {customer.customerCode === 'WALKIN' ? (
                <p className="text-sm text-red-600 text-center bg-red-50 dark:bg-red-950 py-2 rounded">Walk-in customers cannot use credit</p>
              ) : (
                <div className="space-y-2">
                  <div className="bg-muted/30 rounded-lg p-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Credit Limit</span>
                      <span>{formatPkr(customer.creditLimit || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Current Balance</span>
                      <span>{formatPkr(customer.currentBalance || 0)}</span>
                    </div>
                    <div className="flex justify-between font-medium border-t pt-1">
                      <span>Available Credit</span>
                      <span className={availableCredit < creditPortion ? 'text-red-600' : 'text-emerald-600'}>
                        {formatPkr(availableCredit)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-2">{['500','1000','2000','5000'].map((a) => (
                      <Button key={a} variant="outline" size="sm" onClick={() => setCreditPaidAmount((prev) => Math.min(total, prev + Number(a)))} className="flex-1 h-8 text-xs">{formatPkr(Number(a))}</Button>
                    ))}</div>
                    <Input type="number" placeholder="Amount paying now (cash)" value={creditPaidAmount || ''} onChange={(e) => setCreditPaidAmount(Math.min(total, Number(e.target.value) || 0))} className="text-lg font-bold text-center h-10" />
                    {creditPaidAmount > 0 && (
                      <div className="space-y-1 text-sm bg-muted/20 p-2 rounded">
                        <div className="flex justify-between"><span>Cash</span><span className="font-medium">{formatPkr(creditPaidAmount)}</span></div>
                        <div className="flex justify-between"><span>Credit</span><span className="font-medium text-primary">{formatPkr(creditPortion)}</span></div>
                      </div>
                    )}
                  </div>
                  {creditPortion > availableCredit ? (
                    <div className="space-y-2">
                      <p className="text-sm text-red-600 text-center bg-red-50 dark:bg-red-950 py-2 rounded">
                        Insufficient credit. Short by {formatPkr(creditPortion - availableCredit)}
                      </p>
                      {overrideApproved ? (
                        <div className="text-sm text-center text-emerald-600 bg-emerald-50 dark:bg-emerald-950 py-2 rounded">
                          Override approved by {overrideApproved.fullName}
                          <button onClick={clearOverride} className="ml-2 text-xs text-red-500 underline">Clear</button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => setShowOverride(true)}>
                          Request Manager Override
                        </Button>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-emerald-600 text-center bg-emerald-50 dark:bg-emerald-950 py-2 rounded">
                      {creditPortion > 0 ? `${formatPkr(creditPortion)} will be charged to credit` : 'Fully paid in cash'}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          <Button className="w-full h-10" disabled={saving || (paymentMethod === 'CASH' && paidAmount > 0 && paidAmount < total) || (paymentMethod === 'CREDIT' && customer?.customerCode === 'WALKIN') || (paymentMethod === 'CREDIT' && customer && customer.customerCode !== 'WALKIN' && creditPortion > availableCredit && !overrideApproved)} onClick={handleCheckout}>
            {saving ? 'Processing...' : <><Check className="h-4 w-4 mr-2" />Complete Sale</>}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Manager Override Modal */}
      <Dialog open={showOverride} onOpenChange={setShowOverride}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Manager Override Required</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground mb-4">
            Credit limit exceeded. Enter manager credentials to approve this transaction.
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Username</label>
              <Input value={overrideForm.username} onChange={(e) => setOverrideForm({ ...overrideForm, username: e.target.value })} placeholder="Manager username" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Password</label>
              <Input type="password" value={overrideForm.password} onChange={(e) => setOverrideForm({ ...overrideForm, password: e.target.value })} placeholder="Manager password" />
            </div>
            <Button className="w-full" onClick={validateManagerOverride}>Approve Override</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Modal */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="text-center"><div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center mb-2"><Check className="h-6 w-6 text-emerald-600" /></div>
            <DialogTitle>Sale Complete!</DialogTitle></div>
          </DialogHeader>
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground">{customer?.customerCode === 'WALKIN' ? 'Walk-in Sale' : customer?.fullName}</p>
            <p className="text-sm text-muted-foreground">{lastSale?.saleNumber}</p>
            <p className="text-2xl font-bold mt-1">{lastSale ? formatPkr(lastSale.total) : ''}</p>
            {lastSale?.customerCredit > 0 ? (
              <div className="mt-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-2">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Rs. {lastSale.customerCredit} credit issued</p>
                <p className="text-xs text-amber-600 dark:text-amber-500">Return exceeded purchase amount</p>
              </div>
            ) : lastSale?.autoApplied > 0 ? (
              <div className="mt-2 space-y-1">
                <p className="text-sm text-emerald-600 font-medium">Rs. {formatPkr(lastSale.autoApplied)} auto-applied from credit balance</p>
                <p className="text-sm text-muted-foreground">New balance: <span className="font-medium">{formatPkr(lastSale.balance)}</span></p>
              </div>
            ) : lastSale?.creditPortion > 0 ? (
              <div className="mt-2 space-y-1">
                <p className="text-sm text-muted-foreground">Credit used: <span className="font-medium text-primary">{formatPkr(lastSale.creditPortion)}</span></p>
                <p className="text-sm text-muted-foreground">New balance: <span className="font-medium">{formatPkr(lastSale.balance)}</span></p>
                <p className="text-xs text-muted-foreground">Available: {formatPkr((customer?.creditLimit || 0) - (lastSale.balance || 0))}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">{lastSale && lastSale.change > 0 ? `Change: ${formatPkr(lastSale.change)}` : 'Exact amount'}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => { setShowSuccess(false); newSale(); }}>New Sale</Button>
            <Button variant="outline" className="flex-1" onClick={() => { printReceipt(); }}><Printer className="h-4 w-4 mr-2" />Print</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Held Sales Modal */}
      <Dialog open={showHeld} onOpenChange={setShowHeld}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Held Sales</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {heldSales.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No held sales</p> :
              heldSales.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50">
                  <div><p className="text-sm font-medium">{s.saleNumber}</p><p className="text-xs text-muted-foreground">{s.customerName} · {formatPkr(s.total)}</p></div>
                  <Button size="sm" onClick={() => resumeSale(s.id)}>Resume</Button>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Return Modal */}
      <Dialog open={showReturn} onOpenChange={setShowReturn}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{returnStep === 1 ? 'Select Items to Return' : 'Confirm Return'}</DialogTitle>
          </DialogHeader>
          {returnStep === 1 ? (
            <div className="space-y-3">
              {/* Purchase History */}
              <div className="max-h-60 overflow-y-auto space-y-2">
                {customerPurchases.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No purchase history found</p>
                ) : customerPurchases.map((sale: any) => (
                  <div key={sale.saleId} className="border rounded-lg p-3">
                    <p className="text-xs font-medium">{sale.saleNumber} — {new Date(sale.saleDate).toLocaleDateString()}</p>
                    <div className="mt-1 space-y-1">
                      {sale.items.map((item: any) => (
                        <div key={item.saleItemId} className="flex items-center justify-between text-xs">
                          <span className="flex-1 truncate">{item.productName} × {item.quantity}</span>
                          <span className="w-16 text-right">{formatPkr(item.unitPrice)}</span>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] ml-2"
                            onClick={() => addReturnItem(Number(item.productId), item.saleItemId, item.productName, Number(item.unitPrice), item.quantity, sale.saleNumber)}
                            disabled={!!returnItems.find((ri) => ri.saleItemId === item.saleItemId)}>
                            {returnItems.find((ri) => ri.saleItemId === item.saleItemId) ? 'Added' : 'Add'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {purchasesMeta?.totalPages > 1 && (
                <div className="flex justify-between text-xs">
                  <Button variant="outline" size="sm" disabled={returnPage <= 1} onClick={() => loadCustomerPurchases(returnPage - 1)}>Previous</Button>
                  <span className="text-muted-foreground self-center">Page {returnPage} of {purchasesMeta.totalPages}</span>
                  <Button variant="outline" size="sm" disabled={returnPage >= purchasesMeta.totalPages} onClick={() => loadCustomerPurchases(returnPage + 1)}>Next</Button>
                </div>
              )}
              {/* Selected return items */}
              {returnItems.length > 0 && (
                <div className="border-t pt-2 space-y-1">
                  <p className="text-xs font-medium">Items to return:</p>
                  {returnItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="flex-1 truncate">{item.productName}</span>
                      <div className="flex items-center gap-1 mx-2">
                        <button onClick={() => updateReturnQty(i, -1)} className="h-5 w-5 rounded border flex items-center justify-center">-</button>
                        <span className="w-5 text-center">{item.qty}</span>
                        <button onClick={() => updateReturnQty(i, 1)} className="h-5 w-5 rounded border flex items-center justify-center">+</button>
                      </div>
                      <span className="w-16 text-right">{formatPkr(item.unitPrice * item.qty)}</span>
                      <button onClick={() => removeReturnItem(i)} className="text-red-500 ml-1">×</button>
                    </div>
                  ))}
                  <p className="text-xs font-bold text-right">
                    Total Refund: {formatPkr(returnItems.reduce((s: number, i: any) => s + (i.unitPrice * i.qty), 0))}
                  </p>
                </div>
              )}
              <Button className="w-full" disabled={returnItems.length === 0} onClick={() => setReturnStep(2)}>
                Proceed to Confirm
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm space-y-1">
                {returnItems.map((item, i) => (
                  <div key={i} className="flex justify-between border-b pb-1">
                    <span>{item.productName} × {item.qty}</span>
                    <span className="font-medium">{formatPkr(item.unitPrice * item.qty)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-2">
                  <span>Total Refund</span>
                  <span>{formatPkr(returnItems.reduce((s: number, i: any) => s + (i.unitPrice * i.qty), 0))}</span>
                </div>
              </div>
              <div className="space-y-2">
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={returnReason} onChange={(e) => setReturnReason(e.target.value)}>
                  <option value="defective">Defective</option>
                  <option value="wrong_item">Wrong Item</option>
                  <option value="not_satisfied">Not Satisfied</option>
                  <option value="changed_mind">Changed Mind</option>
                  <option value="other">Other</option>
                </select>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                  <option value="cash">Cash Refund</option>
                  <option value="credit">Credit to Account</option>
                </select>
                <textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Notes (optional)" value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setReturnStep(1)}>Back</Button>
                <Button className="flex-1" onClick={submitReturn} disabled={saving}>
                  {saving ? 'Processing...' : 'Process Return'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Clear Cart Confirmation */}
      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>New Sale</DialogTitle></DialogHeader>
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">Clear cart with <strong>{cart.length} item(s)</strong> totaling <strong>{formatPkr(total)}</strong>?</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowClearConfirm(false)}>Keep Items</Button>
            <Button className="flex-1" variant="destructive" onClick={newSale}><Trash2 className="h-4 w-4 mr-2" />Clear & Start New</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Keyboard Shortcuts Overlay */}
      {showShortcuts && (
        <div className="fixed bottom-4 left-4 z-50 bg-card border shadow-xl rounded-lg p-4 max-w-xs" onClick={() => setShowShortcuts(false)}>
          <p className="text-xs font-bold mb-2 text-yellow-600 uppercase">Keyboard Shortcuts</p>
          <div className="space-y-1 text-xs">
            {[['F1','Search/Focus'],['F2','Apply Discount'],['F3','Hold Sale'],['F4','Checkout'],['F5','New Sale'],['F6','Return'],['F8','Toggle Help'],['Esc','Close Modals']].map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="font-mono bg-muted px-1 rounded">{k}</span><span className="text-muted-foreground">{v}</span></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
