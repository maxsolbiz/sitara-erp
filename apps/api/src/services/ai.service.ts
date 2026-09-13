import axios from 'axios';

const MOONSHOT_BASE = 'https://api.moonshot.cn/v1';
const MOONSHOT_KEY = process.env.MOONSHOT_API_KEY || '';

async function moonshotChat(messages: { role: 'system'|'user'|'assistant'; content: string }[], model = 'moonshot-v1-8k'): Promise<string> {
  if (!MOONSHOT_KEY) throw new Error('MOONSHOT_API_KEY not configured');
  const res = await axios.post(`${MOONSHOT_BASE}/chat/completions`, { model, messages, temperature: 0.7, max_tokens: 500 }, { headers: { Authorization: `Bearer ${MOONSHOT_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 });
  return res.data.choices[0].message.content as string;
}

export async function generateProductDescription(name: string, category?: string, price?: number): Promise<string> {
  const content = await moonshotChat([
    { role: 'system', content: 'You are a product copywriter for a Pakistani retail business. Write concise, professional product descriptions in English. Maximum 2 sentences.' },
    { role: 'user', content: `Write a product description for: ${name}, Category: ${category || 'General'}, Price: Rs.${price || 0}` },
  ]);
  return content.trim();
}

export async function generateSalesSummary(stats: { totalSales: number; totalRevenue: number; period: string }): Promise<string> {
  const content = await moonshotChat([
    { role: 'system', content: 'You are a business analyst for a Pakistani retail business. Provide a 2-sentence insight summary from sales data. Be specific and actionable.' },
    { role: 'user', content: `Sales data for ${stats.period}: ${stats.totalSales} sales, Rs.${stats.totalRevenue.toLocaleString()} revenue. Give a brief insight.` },
  ]);
  return content.trim();
}
