const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const DEFAULT_RANGE = '1d';
const DEFAULT_INTERVAL = '5m';
const MAX_SYMBOLS = 16;

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeHistory(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => toFiniteNumber(value))
    .filter((value) => typeof value === 'number');
}

export function parseStockSymbols(raw) {
  return String(raw || '')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
    .filter((symbol, index, arr) => arr.indexOf(symbol) === index)
    .slice(0, MAX_SYMBOLS);
}

function buildYahooChartUrl(symbol, range = DEFAULT_RANGE, interval = DEFAULT_INTERVAL) {
  const url = new URL(`${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}`);
  url.searchParams.set('range', range);
  url.searchParams.set('interval', interval);
  url.searchParams.set('includePrePost', 'false');
  url.searchParams.set('events', 'div,splits');
  return url.toString();
}

export function parseYahooChartQuote(symbol, json) {
  const result = json?.chart?.result?.[0];
  const error = json?.chart?.error;
  if (!result || error) {
    throw new Error(error?.description || `No quote result for ${symbol}`);
  }

  const meta = result.meta || {};
  const quote = result.indicators?.quote?.[0] || {};
  const closes = normalizeHistory(quote.close);
  const lastClose = closes.length ? closes[closes.length - 1] : undefined;
  const price = toFiniteNumber(meta.regularMarketPrice)
    ?? toFiniteNumber(meta.postMarketPrice)
    ?? toFiniteNumber(meta.preMarketPrice)
    ?? lastClose;

  if (typeof price !== 'number') {
    throw new Error(`No price for ${symbol}`);
  }

  const previousClose = toFiniteNumber(meta.chartPreviousClose)
    ?? toFiniteNumber(meta.previousClose)
    ?? (closes.length > 1 ? closes[0] : undefined);
  const changePercent = typeof previousClose === 'number' && previousClose !== 0
    ? ((price - previousClose) / previousClose) * 100
    : 0;
  const normalizedSymbol = String(meta.symbol || symbol).toUpperCase();
  const name = String(meta.shortName || meta.longName || meta.instrumentType || normalizedSymbol);
  const history = closes.length > 1
    ? closes
    : (typeof previousClose === 'number' ? [previousClose, price] : [price]);

  return {
    item: {
      id: normalizedSymbol,
      name,
      symbol: normalizedSymbol,
      current_price: price,
      price_change_percentage_24h: changePercent,
      currency: String(meta.currency || ''),
      exchangeName: String(meta.fullExchangeName || meta.exchangeName || ''),
      regularMarketTime: toFiniteNumber(meta.regularMarketTime),
      image: '',
      provider: 'yahoo-chart',
    },
    history,
  };
}

async function fetchYahooChartQuote(symbol, options = {}) {
  const range = options.range || DEFAULT_RANGE;
  const interval = options.interval || DEFAULT_INTERVAL;
  const response = await fetch(buildYahooChartUrl(symbol, range, interval), {
    headers: {
      accept: 'application/json,text/plain,*/*',
      'user-agent': 'VoidTab/1.0 (+https://github.com/flycodeu)',
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo chart ${symbol} HTTP ${response.status}`);
  }

  return parseYahooChartQuote(symbol, await response.json());
}

export async function fetchStockPayload(symbols, options = {}) {
  const normalized = Array.isArray(symbols) ? symbols : parseStockSymbols(symbols);
  if (!normalized.length) {
    return {
      items: [],
      history: [],
      histories: {},
      symbols: [],
      source: 'yahoo-chart',
      ts: Date.now(),
      errors: [],
    };
  }

  const settled = await Promise.allSettled(
    normalized.map((symbol) => fetchYahooChartQuote(symbol, options).then((quote) => ({symbol, quote})))
  );
  const items = [];
  const histories = {};
  const errors = [];

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      items.push(result.value.quote.item);
      histories[result.value.quote.item.symbol] = result.value.quote.history;
    } else {
      errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }

  if (!items.length) {
    const error = new Error('No stock quotes available');
    error.statusCode = 502;
    error.errors = errors;
    throw error;
  }

  const firstSymbol = items[0]?.symbol;
  return {
    items,
    history: firstSymbol ? (histories[firstSymbol] || []) : [],
    histories,
    symbols: items.map((item) => item.symbol),
    source: 'yahoo-chart',
    ts: Date.now(),
    errors,
  };
}
