const IDX_HOME = 'https://www.idx.co.id/id';
const IDX_INDEX = 'https://www.idx.co.id/primary/home/GetIndexList';
const IDX_STOCK_SUMMARY = 'https://www.idx.co.id/primary/TradingSummary/GetStockSummary';
const IDX_BROKER_SUMMARY = 'https://www.idx.co.id/primary/TradingSummary/GetBrokerSummary';

let sessionCookie = '';
let sessionAt = 0;

const browserHeaders: HeadersInit = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
  Referer: 'https://www.idx.co.id/',
  'Upgrade-Insecure-Requests': '1',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/133.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest'
};

async function ensureSession() {
  const fresh = sessionCookie && Date.now() - sessionAt < 10 * 60 * 1000;
  if (fresh) return;

  const home = await fetch(IDX_HOME, { headers: browserHeaders });
  const cookies = home.headers.getSetCookie?.() ?? [];
  sessionCookie = cookies.join('; ');
  sessionAt = Date.now();
  await home.body?.cancel();

  const headers = { ...browserHeaders, ...(sessionCookie ? { Cookie: sessionCookie } : {}) };
  const check = await fetch(IDX_INDEX, { headers });
  await check.body?.cancel();
}

async function idxFetch(url: string) {
  await ensureSession();
  const headers = { ...browserHeaders, ...(sessionCookie ? { Cookie: sessionCookie } : {}) };
  return fetch(url, { headers });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

function validDate(value: string | null) {
  return !!value && /^\d{8}$/.test(value);
}

async function market(date: string) {
  const response = await idxFetch(`${IDX_STOCK_SUMMARY}?date=${date}`);
  if (!response.ok) throw new Error(`IDX market HTTP ${response.status}`);
  const payload = await response.json();
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((r: Record<string, unknown>) => ({
    date,
    ticker: String(r.StockCode ?? ''),
    open: Number(r.OpenPrice ?? 0),
    high: Number(r.High ?? 0),
    low: Number(r.Low ?? 0),
    close: Number(r.Close ?? 0),
    volume: Number(r.Volume ?? 0),
    value: Number(r.Value ?? 0),
    previous: Number(r.Previous ?? 0),
    change: Number(r.Change ?? 0),
    bid: Number(r.Bid ?? 0),
    bidVolume: Number(r.BidVolume ?? 0),
    offer: Number(r.Offer ?? 0),
    offerVolume: Number(r.OfferVolume ?? 0),
    foreignBuy: Number(r.ForeignBuy ?? 0),
    foreignSell: Number(r.ForeignSell ?? 0)
  })).filter((r: Record<string, unknown>) => r.ticker && Number.isFinite(r.close));
}

async function broker(date: string) {
  const response = await idxFetch(`${IDX_BROKER_SUMMARY}?length=9999&start=0&date=${date}`);
  if (!response.ok) throw new Error(`IDX broker HTTP ${response.status}`);
  const payload = await response.json();
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((r: Record<string, unknown>) => ({
    date,
    broker: String(r.IDFirm ?? ''),
    brokerName: String(r.FirmName ?? ''),
    totalValue: Number(r.Value ?? 0),
    volume: Number(r.Volume ?? 0),
    frequency: Number(r.Frequency ?? 0)
  })).filter((r: Record<string, unknown>) => r.broker);
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return json({ ok: true });
  try {
    if (url.pathname === '/health') {
      return json({ ok: true, service: 'stock-flow-backend', ts: new Date().toISOString(), session: Boolean(sessionCookie) });
    }
    if (url.pathname === '/market') {
      const date = url.searchParams.get('date');
      if (!validDate(date)) return json({ error: 'date must be YYYYMMDD' }, 400);
      return json({ date, serverTimestamp: new Date().toISOString(), data: await market(date) });
    }
    if (url.pathname === '/broker') {
      const date = url.searchParams.get('date');
      if (!validDate(date)) return json({ error: 'date must be YYYYMMDD' }, 400);
      return json({ date, serverTimestamp: new Date().toISOString(), data: await broker(date) });
    }
    return json({ error: 'not found' }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});
