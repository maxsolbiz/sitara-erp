import maxmind, { CityResponse } from 'maxmind';
import axios from 'axios';
import path from 'path';

let mmReader: any = null;
const geoCache = new Map<string, { result: GeoResult | null; expiresAt: number }>();
const CACHE_TTL = 60 * 60 * 1000;

interface GeoResult { country?: string; city?: string; region?: string; timezone?: string; lat?: number; lon?: number; }

export async function initGeoIP(): Promise<void> {
  const dbPath = path.join(process.cwd(), 'data', 'GeoLite2-City.mmdb');
  try {
    mmReader = await maxmind.open<CityResponse>(dbPath);
    console.log('[GeoIP] MaxMind loaded');
  } catch { console.warn('[GeoIP] MaxMind DB not found — IPinfo fallback only'); }
}

export async function lookupIP(ip: string): Promise<GeoResult | null> {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.')) return null;
  const cached = geoCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  let result: GeoResult | null = null;
  if (mmReader) {
    try {
      const r = mmReader.get(ip);
      if (r) result = { country: r.country?.names?.en, city: r.city?.names?.en, region: r.subdivisions?.[0]?.names?.en, lat: r.location?.latitude, lon: r.location?.longitude, timezone: r.location?.time_zone };
    } catch {}
  }
  if (!result) {
    try {
      const token = process.env.IPINFO_TOKEN || '';
      const { data } = await axios.get(`https://ipinfo.io/${ip}/json${token ? `?token=${token}` : ''}`, { timeout: 3000 });
      const [lat, lon] = (data.loc || ',').split(',');
      result = { country: data.country, city: data.city, region: data.region, timezone: data.timezone, lat: parseFloat(lat), lon: parseFloat(lon) };
    } catch {}
  }
  geoCache.set(ip, { result, expiresAt: Date.now() + CACHE_TTL });
  return result;
}
