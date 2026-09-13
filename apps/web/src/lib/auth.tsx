'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from './api';

interface User {
  id: string;
  email: string;
  fullName: string;
  username: string;
  isSuperAdmin: boolean;
  status: string;
  lastLogin: string | null;
  permissions: string[];
  roleAssignments: { roleId: string; name: string; slug: string }[];
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
    settings: Record<string, any>;
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
}

interface RegisterData {
  tenantName: string;
  slug: string;
  email: string;
  password: string;
  fullName: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token || typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    // Skip auth check if on login/register page
    const path = window.location.pathname;
    if (path === '/login' || path === '/register') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setLoading(false);
      return;
    }

    api<User>('/auth/me')
      .then((res) => {
        if (res.data) setUser(res.data);
        else {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        }
      })
      .catch(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api<{ accessToken: string; refreshToken: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (res.error) throw new Error(res.error.detail);

    localStorage.setItem('accessToken', res.data.accessToken);
    localStorage.setItem('refreshToken', res.data.refreshToken);

    const profileRes = await api<User>('/auth/me');
    if (profileRes.data) setUser(profileRes.data);
  };

  const register = async (data: RegisterData) => {
    const res = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.error) throw new Error(res.error.detail);
  };

  const logout = () => {
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export function hasPermission(user: User | null, permission: string): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return user.permissions?.includes(permission) ?? false;
}
