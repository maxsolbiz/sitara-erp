import axios from 'axios';

let cachedRate: { usdPkr: number; fetchedAt: Date } | null = null;

export async function fetchUsdToPkr(): Promise<number | null> {
  if (cachedRate && (Date.now() - cachedRate.fetchedAt.getTime()) < 6 * 3600000) return cachedRate.usdPkr;
  try {
    const API_KEY = process.env.EXCHANGE_RATE_API_KEY || '';
    const url = API_KEY ? `https://v6.exchangerate-api.com/v6/${API_KEY}/pair/USD/PKR` : 'https://open.er-api.com/v6/latest/USD';
    const { data } = await axios.get(url, { timeout: 5000 });
    const rate = data.conversion_rate || data.rates?.PKR;
    if (rate) { cachedRate = { usdPkr: rate, fetchedAt: new Date() }; return rate; }
  } catch { console.warn('[Currency] Exchange rate fetch failed'); }
  return cachedRate?.usdPkr || null;
}

export function startCurrencySync(): void {
  fetchUsdToPkr().catch(() => {});
  setInterval(() => fetchUsdToPkr().catch(() => {}), 6 * 3600000);
}
