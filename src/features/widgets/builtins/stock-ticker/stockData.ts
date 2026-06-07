import {fetchJsonWithRetry} from '../../../../shared/utils/network';

export type StockMarketItem = {
  id: string;
  name: string;
  symbol: string;
  current_price: number;
  price_change_percentage_24h: number;
  currency?: string;
  exchangeName?: string;
  regularMarketTime?: number;
  image?: string;
  provider?: string;
};

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        symbol?: string;
        exchangeName?: string;
        fullExchangeName?: string;
        instrumentType?: string;
        shortName?: string;
        longName?: string;
        regularMarketPrice?: number;
        postMarketPrice?: number;
        preMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketTime?: number;
      };
      indicators?: {
        quote?: Array<{ close?: Array<number | null> }>;
      };
    }>;
    error?: {
      description?: string;
    } | null;
  };
};

type StockProxyResponse = {
  items?: StockMarketItem[];
  history?: number[];
  histories?: Record<string, number[]>;
  source?: string;
  ts?: number;
};

export type StockFetchResult = {
  items: StockMarketItem[];
  history: number[];
  source: string;
  ts: number;
};

const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

const toFiniteNumber = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const normalizeHistory = (values: Array<number | null> | undefined) => {
  if (!Array.isArray(values)) return [];
  return values
      .map(toFiniteNumber)
      .filter((value): value is number => typeof value === 'number');
};

export const normalizeStockSymbols = (symbols: string[] = []) => {
  return symbols
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean)
      .filter((symbol, index, arr) => arr.indexOf(symbol) === index)
      .slice(0, 16);
};

const buildYahooChartUrl = (symbol: string) => {
  const url = new URL(`${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}`);
  url.searchParams.set('range', '1d');
  url.searchParams.set('interval', '5m');
  url.searchParams.set('includePrePost', 'false');
  url.searchParams.set('events', 'div,splits');
  return url.toString();
};

const parseYahooChartQuote = (symbol: string, json: YahooChartResponse): { item: StockMarketItem; history: number[] } => {
  const result = json.chart?.result?.[0];
  const error = json.chart?.error;
  if (!result || error) throw new Error(error?.description || `No quote result for ${symbol}`);

  const meta = result.meta || {};
  const closes = normalizeHistory(result.indicators?.quote?.[0]?.close);
  const lastClose = closes.length ? closes[closes.length - 1] : undefined;
  const price = toFiniteNumber(meta.regularMarketPrice)
      ?? toFiniteNumber(meta.postMarketPrice)
      ?? toFiniteNumber(meta.preMarketPrice)
      ?? lastClose;
  if (typeof price !== 'number') throw new Error(`No price for ${symbol}`);

  const previousClose = toFiniteNumber(meta.chartPreviousClose)
      ?? toFiniteNumber(meta.previousClose)
      ?? (closes.length > 1 ? closes[0] : undefined);
  const changePercent = typeof previousClose === 'number' && previousClose !== 0
      ? ((price - previousClose) / previousClose) * 100
      : 0;
  const normalizedSymbol = String(meta.symbol || symbol).toUpperCase();

  return {
    item: {
      id: normalizedSymbol,
      name: String(meta.shortName || meta.longName || meta.instrumentType || normalizedSymbol),
      symbol: normalizedSymbol,
      current_price: price,
      price_change_percentage_24h: changePercent,
      currency: String(meta.currency || ''),
      exchangeName: String(meta.fullExchangeName || meta.exchangeName || ''),
      regularMarketTime: toFiniteNumber(meta.regularMarketTime),
      image: '',
      provider: 'yahoo-chart',
    },
    history: closes.length > 1
        ? closes
        : (typeof previousClose === 'number' ? [previousClose, price] : [price]),
  };
};

const isExtensionRuntime = () => {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
};

const canUseWebProxy = () => {
  if (isExtensionRuntime()) return false;
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'http:' || window.location.protocol === 'https:';
};

const fetchViaWebProxy = async (symbols: string[]): Promise<StockFetchResult> => {
  const url = `/api/stock?symbols=${encodeURIComponent(symbols.join(','))}&range=1d&interval=5m`;
  const data = await fetchJsonWithRetry<StockProxyResponse>(
      url,
      {cache: 'no-store'},
      {
        timeoutMs: 10000,
        retries: 1,
        retryDelayMs: 500,
        maxRetryDelayMs: 1500,
        metricName: 'stock.proxy',
      }
  );
  const items = (data.items || []).filter((item) => item.symbol && Number.isFinite(Number(item.current_price)));
  if (!items.length) throw new Error('empty stock proxy quote');
  return {
    items,
    history: data.history || data.histories?.[items[0].symbol] || [],
    source: data.source || 'stock-proxy',
    ts: data.ts || Date.now(),
  };
};

const fetchDirectYahooChart = async (symbols: string[]): Promise<StockFetchResult> => {
  const settled = await Promise.allSettled(symbols.map(async (symbol) => {
    const data = await fetchJsonWithRetry<YahooChartResponse>(
        buildYahooChartUrl(symbol),
        {cache: 'no-store'},
        {
          timeoutMs: 10000,
          retries: 1,
          retryDelayMs: 500,
          maxRetryDelayMs: 1500,
          metricName: 'stock.yahoo_chart',
        }
    );
    return parseYahooChartQuote(symbol, data);
  }));

  const quotes = settled
      .filter((result): result is PromiseFulfilledResult<{ item: StockMarketItem; history: number[] }> => result.status === 'fulfilled')
      .map((result) => result.value);
  if (!quotes.length) throw new Error('empty yahoo chart quote');

  return {
    items: quotes.map((quote) => quote.item),
    history: quotes[0]?.history || [],
    source: 'yahoo-chart',
    ts: Date.now(),
  };
};

export async function fetchStockMarketData(symbols: string[]): Promise<StockFetchResult> {
  const normalized = normalizeStockSymbols(symbols);
  if (!normalized.length) return {items: [], history: [], source: 'empty', ts: Date.now()};

  const errors: string[] = [];
  if (canUseWebProxy()) {
    try {
      return await fetchViaWebProxy(normalized);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  try {
    return await fetchDirectYahooChart(normalized);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  throw new Error(errors.filter(Boolean).join('; ') || 'stock data unavailable');
}
