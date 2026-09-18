import { brokerSummary as indexAlphaBrokerSummary, ohlcv as indexAlphaOhlcv } from './providers/indexalpha.ts';

const IDX_HOME = 'https://www.idx.co.id/id';
const IDX_INDEX = 'https://www.idx.co.id/primary/home/GetIndexList';
const IDX_STOCK_SUMMARY = 'https://www.idx.co.id/primary/TradingSummary/GetStockSummary';
const IDX_BROKER_SUMMARY = 'https://www.idx.co.id/primary/TradingSummary/GetBrokerSummary';

type Provider = 'auto' | 'idx' | 'indexalpha';

const configuredProvider = (): Provider => {
  const value = (Deno.env.get('DATA_PROVIDER') ?? 'auto').toLowerCase();
  return value === 'idx' || value === 'indexalpha' || value === 'auto' ? value : 'auto';
};
const normalizeProvider = (value: string | null): Provider | null => {
  if (!value) return null;
  const v = value.toLowerCase();
  return v === 'idx' || v === 'indexalpha' || v === 'auto' ? v : null;
};
const requestedProvider = (value: string | null): Provider => normalizeProvider(value) ?? configuredProvider();
const hasIndexAlphaKey = () => Boolean(Deno.env.get('INDEX_ALPHA_API_KEY')?.trim());

let sessionCookie = '';
let sessionAt = 0;
const stockCache = new Map<string, { at: number; data: unknown }>();

const browserHeaders: HeadersInit = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: 'https://www.idx.co.id/id', Origin: 'https://www.idx.co.id',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/140.0.0.0',
  'X-Requested-With': 'XMLHttpRequest', 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin'
};

async function ensureSession() {
  if (sessionCookie && Date.now() - sessionAt < 10 * 60 * 1000) return;
  const home = await fetch(IDX_HOME, { headers: browserHeaders });
  const cookies = home.headers.getSetCookie?.() ?? [];
  sessionCookie = cookies.join('; '); sessionAt = Date.now(); await home.body?.cancel();
  const check = await fetch(IDX_INDEX, { headers: { ...browserHeaders, ...(sessionCookie ? { Cookie: sessionCookie } : {}) } });
  if (!check.ok) { await check.body?.cancel(); throw new Error(`IDX session check HTTP ${check.status}`); }
  await check.body?.cancel();
}

async function idxFetch(url: string) {
  await ensureSession();
  const headers = { ...browserHeaders, ...(sessionCookie ? { Cookie: sessionCookie } : {}) };
  const response = await fetch(url, { headers });
  if (response.status === 401 || response.status === 403) {
    sessionCookie = ''; sessionAt = 0; await response.body?.cancel(); await ensureSession();
    return fetch(url, { headers: { ...browserHeaders, ...(sessionCookie ? { Cookie: sessionCookie } : {}) } });
  }
  return response;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'
  }});
}
function validDate(value: string | null) { return !!value && /^\d{8}$/.test(value); }
function payloadRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  for (const key of ['data', 'rows', 'Data', 'Rows']) if (Array.isArray(p[key])) return p[key] as Record<string, unknown>[];
  return [];
}

async function market(date: string) {
  const response = await idxFetch(`${IDX_STOCK_SUMMARY}?date=${date}`);
  if (!response.ok) throw new Error(`IDX market HTTP ${response.status}`);
  return payloadRows(await response.json()).map(r => ({
    date, ticker: String(r.StockCode ?? ''), open: Number(r.OpenPrice ?? 0), high: Number(r.High ?? 0), low: Number(r.Low ?? 0),
    close: Number(r.Close ?? 0), volume: Number(r.Volume ?? 0), value: Number(r.Value ?? 0), previous: Number(r.Previous ?? 0), change: Number(r.Change ?? 0),
    bid: Number(r.Bid ?? 0), bidVolume: Number(r.BidVolume ?? 0), offer: Number(r.Offer ?? 0), offerVolume: Number(r.OfferVolume ?? 0),
    foreignBuy: Number(r.ForeignBuy ?? 0), foreignSell: Number(r.ForeignSell ?? 0)
  })).filter(r => r.ticker && Number.isFinite(r.close));
}

async function idxBroker(date: string) {
  const response = await idxFetch(`${IDX_BROKER_SUMMARY}?length=9999&start=0&date=${date}`);
  if (!response.ok) throw new Error(`IDX broker HTTP ${response.status}`);
  return payloadRows(await response.json()).map(r => ({ date, broker: String(r.IDFirm ?? ''), brokerName: String(r.FirmName ?? ''), totalValue: Number(r.Value ?? 0), volume: Number(r.Volume ?? 0), frequency: Number(r.Frequency ?? 0) })).filter(r => r.broker);
}

async function broker(date: string, ticker: string | null, provider = configuredProvider()) {
  if (provider === 'indexalpha') { if (!ticker) throw new Error('ticker is required when provider=indexalpha'); return await indexAlphaBrokerSummary(ticker, date); }
  if (provider === 'auto' && ticker && hasIndexAlphaKey()) {
    try { return await indexAlphaBrokerSummary(ticker, date); }
    catch (error) { console.warn('[PROVIDER] Index Alpha broker failed, falling back to IDX:', error); }
  }
  return await idxBroker(date);
}

async function ohlcv(ticker: string, from: string, to = from, provider = configuredProvider()) {
  if (provider === 'indexalpha' || (provider === 'auto' && hasIndexAlphaKey())) return await indexAlphaOhlcv(ticker, from, to);
  if (from !== to) {
    const data: unknown[] = [];
    const start = new Date(`${from.slice(0,4)}-${from.slice(4,6)}-${from.slice(6,8)}T00:00:00Z`);
    const end = new Date(`${to.slice(0,4)}-${to.slice(4,6)}-${to.slice(6,8)}T00:00:00Z`);
    for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
      const ds = d.toISOString().slice(0,10).replaceAll('-','');
      const rows = await market(ds); data.push(...rows.filter(row => row.ticker.toUpperCase() === ticker.toUpperCase()));
    }
    return data;
  }
  return (await market(from)).filter(row => row.ticker.toUpperCase() === ticker.toUpperCase());
}

async function stock(ticker: string, from: string, to: string, provider = configuredProvider()) {
  const key = `${provider}|${ticker.toUpperCase()}|${from}|${to}`;
  const cached = stockCache.get(key);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.data;
  const prices = await ohlcv(ticker, from, to, provider);
  let brokerRows: unknown[] = [];
  // Align broker flow with the same historical trading dates as OHLCV.
  // The previous implementation fetched only the final date, which made
  // persistence/rotation unavailable in live analysis.
  if (provider === 'indexalpha' || (provider === 'auto' && hasIndexAlphaKey())) {
    const dates = [...new Set(prices.map((r: any) => String(r.date)).filter(Boolean))].slice(-20);
    for (let i = 0; i < dates.length; i += 5) {
      const chunk = dates.slice(i, i + 5);
      const batch = await Promise.all(chunk.map(date => broker(date.replaceAll('-', ''), ticker, 'indexalpha')));
      brokerRows.push(...batch.flat());
    }
  } else {
    brokerRows = await broker(to, ticker, provider);
  }
  const result = { ticker: ticker.toUpperCase(), from, to, prices, broker: brokerRows };
  stockCache.set(key, { at: Date.now(), data: result });
  return result;
}

const staticFiles: Record<string, { path: string; type: string }> = {
  '/': { path: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { path: 'index.html', type: 'text/html; charset=utf-8' },
  '/styles.css': { path: 'styles.css', type: 'text/css; charset=utf-8' },
  '/analysis.js': { path: 'analysis.js', type: 'application/javascript; charset=utf-8' },
  '/data-provider.js': { path: 'data-provider.js', type: 'application/javascript; charset=utf-8' },
  '/app.js': { path: 'app.js', type: 'application/javascript; charset=utf-8' },
  '/manifest.webmanifest': { path: 'manifest.webmanifest', type: 'application/manifest+json; charset=utf-8' },
  '/icon.svg': { path: 'icon.svg', type: 'image/svg+xml' },
  '/sw.js': { path: 'sw.js', type: 'application/javascript; charset=utf-8' }
};

async function serveStatic(pathname: string) {
  const file = staticFiles[pathname];
  if (!file) return null;
  try {
    const body = await Deno.readFile(file.path);
    return new Response(body, { headers: { 'Content-Type': file.type, 'Cache-Control': pathname === '/' ? 'no-store' : 'no-cache' } });
  } catch {
    return new Response('Frontend file not found', { status: 500 });
  }
}

Deno.serve(async request => {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return json({ ok: true });
  try {
    if (url.pathname === '/') return (await serveStatic('/'))!;
    if (staticFiles[url.pathname] && !url.pathname.startsWith('/api/')) return (await serveStatic(url.pathname))!;
    if (url.pathname === '/health') return json({ ok: true, service: 'stock-flow-backend', ts: new Date().toISOString(), provider: configuredProvider(), indexAlphaConfigured: hasIndexAlphaKey(), session: Boolean(sessionCookie) });
    if (url.pathname === '/market') {
      const date = url.searchParams.get('date'); if (!validDate(date)) return json({ error: 'date must be YYYYMMDD' }, 400);
      const data = await market(date); return json({ ok: true, provider: 'idx', date, serverTimestamp: new Date().toISOString(), count: data.length, data });
    }
    if (url.pathname === '/broker') {
      const date = url.searchParams.get('date'), ticker = url.searchParams.get('ticker'), provider = requestedProvider(url.searchParams.get('provider')); if (!validDate(date)) return json({ error: 'date must be YYYYMMDD' }, 400);
      const data = await broker(date, ticker, provider); return json({ ok: true, provider: provider === 'indexalpha' || (provider === 'auto' && ticker && hasIndexAlphaKey()) ? 'indexalpha' : 'idx', date, ticker: ticker?.toUpperCase() ?? null, serverTimestamp: new Date().toISOString(), count: data.length, data });
    }
    if (url.pathname === '/ohlcv') {
      const date = url.searchParams.get('date'), ticker = url.searchParams.get('ticker'), provider = requestedProvider(url.searchParams.get('provider')); if (!validDate(date)) return json({ error: 'date must be YYYYMMDD' }, 400); if (!ticker) return json({ error: 'ticker is required' }, 400);
      const data = await ohlcv(ticker, date, date, provider); return json({ ok: true, provider: provider === 'idx' ? 'idx' : 'indexalpha', date, ticker: ticker.toUpperCase(), serverTimestamp: new Date().toISOString(), count: data.length, data });
    }
    if (url.pathname === '/stock') {
      const ticker = url.searchParams.get('ticker'), from = url.searchParams.get('from'), to = url.searchParams.get('to'), provider = requestedProvider(url.searchParams.get('provider'));
      if (!ticker) return json({ error: 'ticker is required' }, 400); if (!validDate(from) || !validDate(to)) return json({ error: 'from and to must be YYYYMMDD' }, 400);
      const data = await stock(ticker, from, to, provider); return json({ ok: true, provider: provider === 'idx' ? 'idx' : 'indexalpha', serverTimestamp: new Date().toISOString(), ...data });
    }
    return json({ error: 'not found' }, 404);
  } catch (error) { console.error('[ERROR]', error); return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502); }
});
