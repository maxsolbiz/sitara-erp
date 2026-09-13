const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

interface ApiOptions extends RequestInit {
  params?: Record<string, string>;
}

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refreshToken');
}

function setTokens(access: string, refresh: string) {
  localStorage.setItem('accessToken', access);
  localStorage.setItem('refreshToken', refresh);
}

let refreshPromise: Promise<boolean> | null = null;

function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

async function refreshAccessToken(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts — only one in-flight at a time
  if (refreshPromise) return refreshPromise;

  const refresh = getRefreshToken();
  if (!refresh) { refreshPromise = null; return false; }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });

      if (!res.ok) {
        clearTokens();
        return false;
      }

      const data = await res.json();
      setTokens(data.data.accessToken, data.data.refreshToken);
      return true;
    } catch {
      clearTokens();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function api<T = any>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<{ data: T; error?: never } | { data?: never; error: { status: number; detail: string; errors?: any[] } }> {
  const { params, ...fetchOptions } = options;

  let url = `${API_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...fetchOptions, headers });

  if (res.status === 401 && token) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const newToken = getAccessToken();
      headers['Authorization'] = `Bearer ${newToken}`;
      const retryRes = await fetch(url, { ...fetchOptions, headers });
      return retryRes.json();
    }

    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return { error: { status: 401, detail: 'Session expired' } };
  }

  return res.json();
}

export function setAuth(accessToken: string, refreshToken: string) {
  setTokens(accessToken, refreshToken);
}

export function logout() {
  clearTokens();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

// Convenience methods
export const apiGet = <T = any>(endpoint: string, options?: ApiOptions) =>
  api<T>(endpoint, { ...options, method: 'GET' });

export const apiPost = <T = any>(endpoint: string, body?: any, options?: ApiOptions) =>
  api<T>(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) });

export const apiPut = <T = any>(endpoint: string, body?: any, options?: ApiOptions) =>
  api<T>(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) });

export const apiPatch = <T = any>(endpoint: string, body?: any, options?: ApiOptions) =>
  api<T>(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) });

export const apiDelete = <T = any>(endpoint: string, options?: ApiOptions) =>
  api<T>(endpoint, { ...options, method: 'DELETE' });

// Authenticated file download (Blob)
export async function downloadFile(url: string, filename?: string): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) { console.error('Download failed', res.status); return; }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename || url.split('/').pop() || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

export { getAccessToken, getRefreshToken };
