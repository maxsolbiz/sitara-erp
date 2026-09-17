'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useThemeColor, THEME_COLORS, type ThemeColor } from '@/lib/theme-color';
import { useAuth, hasPermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NotificationBell } from '@/components/notification-bell';
import { apiGet } from '@/lib/api';
import {
  Search as SearchIcon, HelpCircle, Moon, Sun, LogOut, User, Palette, Check,
  Settings, LayoutDashboard, ShoppingCart, Plus, Package as PackageIcon,
  Users as UsersIcon, Truck as TruckIcon, Package, ShoppingBag,
  Building2, Wallet, Loader2,
} from 'lucide-react';

interface NavbarProps {
  onMenuToggle: () => void;
}

export function Navbar({ onMenuToggle }: NavbarProps) {
  const { theme, setTheme } = useTheme();
  const { themeColor, setThemeColor } = useThemeColor();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); setShowResults(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await apiGet(`/search?q=${searchQuery}&limit=5`).catch(() => null);
      if (res?.data) { setSearchResults(res.data); setShowResults(true); setSelectedIdx(-1); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); inputRef.current?.focus(); }
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault(); inputRef.current?.focus();
      }
      if (!showResults) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((prev) => Math.min(prev + 1, searchResults.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((prev) => Math.max(prev - 1, 0)); }
      if (e.key === 'Enter' && selectedIdx >= 0 && searchResults[selectedIdx]) {
        e.preventDefault(); router.push(searchResults[selectedIdx].link); setShowResults(false); setSearchQuery('');
      }
      if (e.key === 'Escape') { setShowResults(false); inputRef.current?.blur(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showResults, selectedIdx, searchResults, router]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const typeIcons: Record<string, any> = {
    product: Package, customer: UsersIcon, vendor: Building2,
    sale: ShoppingBag, purchase: TruckIcon, expense: Wallet,
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b bg-background px-4 lg:px-6">
      <Button variant="ghost" size="icon" onClick={onMenuToggle} className="lg:hidden h-9 w-9">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 5H17M3 10H17M3 15H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </Button>

      {/* Search */}
      <div className="hidden md:flex relative flex-1 max-w-md" ref={searchRef}>
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input ref={inputRef}
          placeholder="Search products, customers, orders... (Ctrl+K)"
          value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => searchResults.length > 0 && setShowResults(true)}
          className="flex h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        {showResults && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border bg-popover shadow-xl overflow-hidden">
            {searchResults.map((r: any, i: number) => {
              const Icon = typeIcons[r.type] || SearchIcon;
              return (
                <Link key={`${r.type}-${r.id}`} href={r.link}
                  className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-accent ${i === selectedIdx ? 'bg-accent' : ''} ${i > 0 ? 'border-t border-border/50' : ''}`}
                  onClick={() => { setShowResults(false); setSearchQuery(''); }}>
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{r.meta}</span>
                </Link>
              );
            })}
          </div>
        )}
        {showResults && searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
          <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border bg-popover shadow-xl p-4 text-center text-sm text-muted-foreground">
            No results for '{searchQuery}'
          </div>
        )}
      </div>

      <div className="flex flex-1 md:hidden" />

      {/* Right actions */}
      <div className="flex items-center gap-1.5">
        {/* Quick Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/pos"><ShoppingCart className="h-4 w-4 mr-2" />Open POS</Link></DropdownMenuItem>
            {hasPermission(user, 'products.create') && <DropdownMenuItem asChild><Link href="/products/create"><PackageIcon className="h-4 w-4 mr-2" />New Product</Link></DropdownMenuItem>}
            {hasPermission(user, 'customers.create') && <DropdownMenuItem asChild><Link href="/customers/create"><UsersIcon className="h-4 w-4 mr-2" />New Customer</Link></DropdownMenuItem>}
            {hasPermission(user, 'purchases.create') && <DropdownMenuItem asChild><Link href="/purchases/orders/create"><TruckIcon className="h-4 w-4 mr-2" />New Purchase</Link></DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>

        <NotificationBell />

        {/* Theme Color */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9" title="Color theme">
              <Palette className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Color theme</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(THEME_COLORS as readonly ThemeColor[]).map((t) => (
              <DropdownMenuItem key={t} onClick={() => setThemeColor(t)} className="flex items-center gap-2 capitalize">
                <span
                  className={
                    t === 'emerald' ? 'h-3.5 w-3.5 rounded-full bg-emerald-600'
                    : t === 'amber' ? 'h-3.5 w-3.5 rounded-full bg-amber-500'
                    : 'h-3.5 w-3.5 rounded-full bg-blue-600'
                  }
                />
                <span className="flex-1">{t === 'default' ? 'Default blue' : t}</span>
                {themeColor === t && <Check className="h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/settings/appearance"><Settings className="h-4 w-4 mr-2" />Appearance settings</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme Toggle (light/dark — orthogonal to color theme) */}
        <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="h-9 w-9">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* Help */}
        <Button variant="ghost" size="icon" className="h-9 w-9 hidden md:inline-flex">
          <HelpCircle className="h-4 w-4" />
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 h-9 px-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {user?.fullName?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="hidden lg:flex flex-col items-start text-left">
                <span className="text-sm font-medium leading-none">{user?.fullName || 'User'}</span>
                <span className="text-[10px] text-muted-foreground leading-none mt-0.5">{user?.tenant?.name || ''}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{user?.fullName}</span>
                <span className="text-xs text-muted-foreground font-normal">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/profile"><User className="h-4 w-4 mr-2" />Profile</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/settings"><Settings className="h-4 w-4 mr-2" />Settings</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive">
              <LogOut className="h-4 w-4 mr-2" />Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
