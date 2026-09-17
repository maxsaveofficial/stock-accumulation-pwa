const BASE_URL = 'https://api.indexalpha.id';

export interface IndexAlphaBrokerRow {
  code: string;
  buy_freq: number;
  buy_volume: number;
  buy_value: number;
  sell_freq: number;
  sell_volume: number;
  sell_value: number;
  buy_avg: number;
  sell_avg: number;
}

function apiKey() {
  const key = Deno.env.get('INDEX_ALPHA_API_KEY')?.trim();
  if (!key) throw new Error('INDEX_ALPHA_API_KEY is not configured');
  return key;
}

function headers(): HeadersInit {
  return { Accept: 'application/json', Authorization: `Bearer ${apiKey()}` };
}

function checkDate(date: string) {
  if (!/^\d{8}$/.test(date)) throw new Error('date must be YYYYMMDD');
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

export async function brokerSummary(ticker: string, date: string) {
  const d = checkDate(date);
  const params = new URLSearchParams({ ticker: ticker.toUpperCase(), from: d, to: d, investor: 'all', market: 'RG' });
  const response = await fetch(`${BASE_URL}/stocks/broker-summary?${params}`, { headers: headers() });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body && typeof body === 'object' && 'error' in body ? String((body as { error?: unknown }).error) : '';
    throw new Error(`Index Alpha broker HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  const rows = body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)
    ? (body as { data: IndexAlphaBrokerRow[] }).data : [];
  return rows.map(r => ({
    date, ticker: ticker.toUpperCase(), broker: String(r.code ?? ''), brokerName: String(r.code ?? ''),
    buyValue: Number(r.buy_value ?? 0), sellValue: Number(r.sell_value ?? 0),
    totalValue: Number(r.buy_value ?? 0) + Number(r.sell_value ?? 0),
    buyVolume: Number(r.buy_volume ?? 0), sellVolume: Number(r.sell_volume ?? 0),
    volume: Number(r.buy_volume ?? 0) + Number(r.sell_volume ?? 0),
    buyFrequency: Number(r.buy_freq ?? 0), sellFrequency: Number(r.sell_freq ?? 0),
    frequency: Number(r.buy_freq ?? 0) + Number(r.sell_freq ?? 0),
    buyAvg: Number(r.buy_avg ?? 0), sellAvg: Number(r.sell_avg ?? 0),
    netValue: Number(r.buy_value ?? 0) - Number(r.sell_value ?? 0),
  })).filter(r => r.broker);
}

export async function ohlcv(ticker: string, from: string, to = from) {
  const fromDate = checkDate(from), toDate = checkDate(to);
  if (fromDate > toDate) throw new Error('from must be <= to');
  const symbol = ticker.toUpperCase();
  const params = new URLSearchParams({ ticker: symbol, from: fromDate, to: toDate });
  const response = await fetch(`${BASE_URL}/stocks/ohlcv?${params}`, { headers: headers() });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body && typeof body === 'object' && 'error' in body ? String((body as { error?: unknown }).error) : '';
    throw new Error(`Index Alpha OHLCV HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  const rows = body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)
    ? (body as { data: Record<string, unknown>[] }).data : [];

  // Index Alpha's OHLCV response is ticker-specific and therefore does not
  // include a ticker field. Our frontend normalizer requires one, so inject
  // the requested symbol here while preserving the documented OHLCV fields.
  return rows.map(r => ({
    date: String(r.date ?? r.tradeDate ?? ''),
    ticker: symbol,
    open: Number(r.open ?? NaN),
    high: Number(r.high ?? NaN),
    low: Number(r.low ?? NaN),
    close: Number(r.close ?? NaN),
    volume: Number(r.volume ?? 0),
    value: Number(r.value ?? 0),
  })).filter(r => r.date && [r.open, r.high, r.low, r.close].every(Number.isFinite));
}
