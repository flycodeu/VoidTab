import {fetchStockPayload, parseStockSymbols} from './stock-core.js';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({error: 'Method not allowed'});
    return;
  }

  const symbols = parseStockSymbols(req.query?.symbols);
  if (!symbols.length) {
    res.status(400).json({error: 'Missing symbols'});
    return;
  }

  try {
    const payload = await fetchStockPayload(symbols, {
      range: String(req.query?.range || '1d'),
      interval: String(req.query?.interval || '5m'),
    });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json(payload);
  } catch (error) {
    res.status(error?.statusCode || 502).json({
      error: error instanceof Error ? error.message : 'Stock quote unavailable',
      errors: error?.errors || [],
    });
  }
}
