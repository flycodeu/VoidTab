import {fetchFaviconProxyPayload} from './favicon-core.js';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({error: 'Method not allowed'});
    return;
  }

  const rawUrl = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;

  try {
    const payload = await fetchFaviconProxyPayload(rawUrl);
    res.setHeader('Content-Type', payload.contentType);
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-VoidTab-Favicon-Source', payload.source);
    if (req.method === 'HEAD') {
      res.status(200).end();
    } else {
      res.status(200).send(payload.body);
    }
  } catch (error) {
    res.status(error?.statusCode || 502).json({
      error: error instanceof Error ? error.message : 'Favicon unavailable',
    });
  }
}
