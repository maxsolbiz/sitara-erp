import axios from 'axios';
import logger from '../utils/logger';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_BASE = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'openai/gpt-oss-20b';

let geminiFailures = 0;
let groqFailures = 0;
let geminiCooldownUntil = 0;
let groqCooldownUntil = 0;
const MAX_FAILURES = 3;
const COOLDOWN_MS = 5 * 60 * 1000;

function isRetryableError(error: any): boolean {
  if (!error.response) return true;
  const status = error.response.status;
  return status === 429 || status >= 500;
}

function recordFailure(provider: 'gemini' | 'groq') {
  if (provider === 'gemini') {
    geminiFailures++;
    if (geminiFailures >= MAX_FAILURES) geminiCooldownUntil = Date.now() + COOLDOWN_MS;
  } else {
    groqFailures++;
    if (groqFailures >= MAX_FAILURES) groqCooldownUntil = Date.now() + COOLDOWN_MS;
  }
}

function recordSuccess(provider: 'gemini' | 'groq') {
  if (provider === 'gemini') { geminiFailures = 0; geminiCooldownUntil = 0; }
  else { groqFailures = 0; groqCooldownUntil = 0; }
}

function isInCooldown(provider: 'gemini' | 'groq'): boolean {
  return provider === 'gemini' ? Date.now() < geminiCooldownUntil : Date.now() < groqCooldownUntil;
}

async function geminiChat(messages: { role: 'system'|'user'|'assistant'; content: string }[]): Promise<string> {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');
  if (isInCooldown('gemini')) throw new Error('Gemini in cooldown');

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const start = Date.now();
  try {
    const res = await axios.post(`${GEMINI_BASE}?key=${GEMINI_KEY}`, {
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
    }, { timeout: 15000 });

    const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty Gemini response');

    recordSuccess('gemini');
    logger.info('AI call success', { provider: 'gemini', latencyMs: Date.now() - start, tokensEst: Math.round(text.length / 4) });
    return text.trim();
  } catch (e: any) {
    recordFailure('gemini');
    logger.warn('AI call failed', { provider: 'gemini', latencyMs: Date.now() - start, error: e.message, status: e.response?.status });
    throw e;
  }
}

async function groqChat(messages: { role: 'system'|'user'|'assistant'; content: string }[]): Promise<string> {
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY not configured');
  if (isInCooldown('groq')) throw new Error('Groq in cooldown');

  const start = Date.now();
  try {
    const res = await axios.post(GROQ_BASE, {
      model: GROQ_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 500
    }, { headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' }, timeout: 15000 });

    const text = res.data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Empty Groq response');

    recordSuccess('groq');
    logger.info('AI call success', { provider: 'groq', latencyMs: Date.now() - start, tokensEst: Math.round(text.length / 4) });
    return text.trim();
  } catch (e: any) {
    recordFailure('groq');
    logger.warn('AI call failed', { provider: 'groq', latencyMs: Date.now() - start, error: e.message, status: e.response?.status });
    throw e;
  }
}

async function chatWithFallback(messages: { role: 'system'|'user'|'assistant'; content: string }[]): Promise<string> {
  try {
    return await geminiChat(messages);
  } catch (e: any) {
    const shouldFallback = isRetryableError(e) || e.message.includes('cooldown') || e.message.includes('not configured');
    if (!shouldFallback) throw e;

    logger.info('Falling back to Groq', { reason: e.message });
    try {
      return await groqChat(messages);
    } catch (groqError: any) {
      throw new Error(`AI services unavailable: Gemini (${e.message}), Groq (${groqError.message})`);
    }
  }
}

export async function generateProductDescription(name: string, category?: string, price?: number): Promise<string> {
  const content = await chatWithFallback([
    { role: 'system', content: 'You are a product copywriter for a Pakistani retail business. Write concise, professional product descriptions in English. Maximum 2 sentences.' },
    { role: 'user', content: `Write a product description for: ${name}, Category: ${category || 'General'}, Price: Rs.${price || 0}` },
  ]);
  return content;
}

export async function generateSalesSummary(stats: { totalSales: number; totalRevenue: number; period: string }): Promise<string> {
  const content = await chatWithFallback([
    { role: 'system', content: 'You are a business analyst for a Pakistani retail business. Provide a 2-sentence insight summary from sales data. Be specific and actionable.' },
    { role: 'user', content: `Sales data for ${stats.period}: ${stats.totalSales} sales, Rs.${stats.totalRevenue.toLocaleString()} revenue. Give a brief insight.` },
  ]);
  return content;
}