import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_BYTES = 768 * 1024;
const REQUEST_TIMEOUT_MS = 4500;
const MAX_REDIRECTS = 4;
const USER_AGENT = 'VoidTab-FaviconProxy/1.0 (+https://github.com/flycodeu)';

const MULTI_LEVEL_PUBLIC_SUFFIXES = new Set([
  'ac.uk',
  'co.jp',
  'co.kr',
  'co.nz',
  'co.uk',
  'com.au',
  'com.br',
  'com.cn',
  'com.hk',
  'com.sg',
  'com.tw',
  'edu.cn',
  'gov.cn',
  'net.cn',
  'org.cn',
]);

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeTargetUrl(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) throw createHttpError(400, 'Missing url');

  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw createHttpError(400, 'Invalid url');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw createHttpError(400, 'Only http(s) urls are supported');
  }
  parsed.hash = '';
  return parsed;
}

function normalizeHost(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/\.+$/, '');
}

function isPrivateIpv4(host, options = {}) {
  const parts = host.split('.').map((x) => Number(x));
  if (parts.length !== 4 || parts.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (!options.allowBenchmarkNet && a === 198 && (b === 18 || b === 19));
}

function isPrivateIpv6(host) {
  const normalized = host.toLowerCase();
  return normalized === '::1'
    || normalized === '::'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:');
}

function isPrivateHostLiteral(hostname, options = {}) {
  const host = normalizeHost(hostname).replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) return isPrivateIpv4(host, options);
  if (ipVersion === 6) return isPrivateIpv6(host);
  return false;
}

async function assertPublicHttpUrl(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw createHttpError(400, 'Only http(s) urls are supported');
  }

  const host = normalizeHost(url.hostname);
  if (isPrivateHostLiteral(host)) {
    throw createHttpError(400, 'Private hosts are not supported');
  }

  try {
    const addresses = await dns.lookup(host, {all: true, verbatim: false});
    if (!addresses.length || addresses.some((entry) => isPrivateHostLiteral(entry.address, {allowBenchmarkNet: true}))) {
      throw createHttpError(400, 'Private hosts are not supported');
    }
  } catch (error) {
    if (error?.statusCode) throw error;
    throw createHttpError(502, 'Unable to resolve host');
  }
}

async function fetchWithRedirects(url, options = {}) {
  let current = new URL(url);
  const timeoutMs = Number(options.timeoutMs || REQUEST_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      await assertPublicHttpUrl(current);
      const response = await fetch(current, {
        method: options.method || 'GET',
        headers: options.headers || {},
        redirect: 'manual',
        signal: controller.signal,
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) return {response, finalUrl: current.toString()};
        current = new URL(location, current);
        continue;
      }

      return {response, finalUrl: current.toString()};
    }
  } finally {
    clearTimeout(timer);
  }

  throw createHttpError(502, 'Too many redirects');
}

async function readBodyLimited(response, maxBytes) {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > maxBytes) throw createHttpError(502, 'Favicon response too large');

  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw createHttpError(502, 'Favicon response too large');
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.byteLength;
    if (total > maxBytes) throw createHttpError(502, 'Favicon response too large');
    chunks.push(chunk);
  }

  return Buffer.concat(chunks, total);
}

function getRegistrableDomain(hostname) {
  const host = normalizeHost(hostname);
  const labels = host.split('.').filter(Boolean);
  if (labels.length <= 2) return host;

  const publicSuffix2 = `${labels[labels.length - 2]}.${labels[labels.length - 1]}`;
  if (MULTI_LEVEL_PUBLIC_SUFFIXES.has(publicSuffix2) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }

  return labels.slice(-2).join('.');
}

function getQueryDomains(hostname) {
  const host = normalizeHost(hostname);
  if (!host) return [];
  const registrable = getRegistrableDomain(host);
  if (!registrable || registrable === host) return [host];
  return [host, registrable];
}

function resolveHttpUrl(raw, base) {
  if (!raw) return '';
  try {
    const resolved = new URL(raw, base);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return '';
    resolved.hash = '';
    return resolved.toString();
  } catch {
    return '';
  }
}

function parseAttributes(tag) {
  const attrs = {};
  const re = /([^\s"'=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match;
  while ((match = re.exec(tag))) {
    attrs[String(match[1] || '').toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

function largestDeclaredEdge(sizeValue) {
  let max = 0;
  for (const token of String(sizeValue || '').toLowerCase().split(/\s+/)) {
    if (token === 'any') {
      max = Math.max(max, 1024);
      continue;
    }
    const match = token.match(/^(\d+)x(\d+)$/);
    if (!match) continue;
    max = Math.max(max, Math.min(Number(match[1]), Number(match[2])));
  }
  return max;
}

function scoreCandidate(url, rel = '', type = '', sizes = '') {
  let score = largestDeclaredEdge(sizes);
  const lowerUrl = String(url || '').toLowerCase();
  const lowerRel = String(rel || '').toLowerCase();
  const lowerType = String(type || '').toLowerCase();
  if (lowerType.includes('svg') || lowerUrl.endsWith('.svg')) score += 1000;
  if (lowerType.includes('png') || lowerUrl.endsWith('.png') || lowerUrl.endsWith('.webp')) score += 200;
  if (lowerRel.includes('apple-touch-icon')) score += 120;
  if (lowerRel.includes('mask-icon')) score += 80;
  if (lowerRel.includes('shortcut icon')) score += 20;
  return score;
}

async function fetchText(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const {response, finalUrl} = await fetchWithRedirects(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/json;q=0.7,text/plain;q=0.5,*/*;q=0.2',
      'user-agent': USER_AGENT,
    },
    timeoutMs,
  });

  if (!response.ok) return null;
  const buffer = await readBodyLimited(response, MAX_TEXT_BYTES);
  return {
    text: new TextDecoder('utf-8').decode(buffer),
    finalUrl,
    contentType: response.headers.get('content-type') || '',
  };
}

async function getDeclaredCandidates(pageUrl, timeoutMs = 2200) {
  let htmlPayload;
  try {
    htmlPayload = await fetchText(pageUrl, timeoutMs);
  } catch {
    return [];
  }
  if (!htmlPayload?.text) return [];

  const baseUrl = htmlPayload.finalUrl || pageUrl;
  const scored = [];
  const linkTags = htmlPayload.text.match(/<link\b[^>]*>/gi) || [];
  let manifestUrl = '';

  for (const tag of linkTags) {
    const attrs = parseAttributes(tag);
    const rel = String(attrs.rel || '').toLowerCase();
    const href = String(attrs.href || '').trim();
    if (!href) continue;

    if (rel.includes('manifest') && !manifestUrl) {
      manifestUrl = resolveHttpUrl(href, baseUrl);
    }

    if (!rel.includes('icon') && !rel.includes('apple-touch-icon') && !rel.includes('mask-icon')) continue;
    const resolved = resolveHttpUrl(href, baseUrl);
    if (!resolved) continue;
    scored.push({
      url: resolved,
      score: scoreCandidate(resolved, rel, attrs.type, attrs.sizes),
    });
  }

  if (manifestUrl) {
    try {
      const manifestPayload = await fetchText(manifestUrl, Math.min(timeoutMs, 1800));
      const manifest = manifestPayload?.text ? JSON.parse(manifestPayload.text) : null;
      const icons = Array.isArray(manifest?.icons) ? manifest.icons : [];
      for (const icon of icons) {
        const src = String(icon?.src || '').trim();
        if (!src) continue;
        const resolved = resolveHttpUrl(src, manifestPayload?.finalUrl || manifestUrl);
        if (!resolved) continue;
        scored.push({
          url: resolved,
          score: scoreCandidate(resolved, 'manifest', icon?.type, icon?.sizes),
        });
      }
    } catch {
      // Ignore broken manifests.
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((item) => item.url);
}

function buildCommonOriginCandidates(pageUrl) {
  const parsed = new URL(pageUrl);
  const origin = parsed.origin;
  return [
    `${origin}/favicon.svg`,
    `${origin}/apple-touch-icon.png`,
    `${origin}/favicon-192x192.png`,
    `${origin}/favicon-96x96.png`,
    `${origin}/favicon-32x32.png`,
    `${origin}/favicon.png`,
    `${origin}/favicon.ico`,
  ];
}

function buildProviderCandidates(pageUrl) {
  const host = normalizeHost(new URL(pageUrl).hostname);
  const domains = getQueryDomains(host);
  const out = [];

  for (const domain of domains) {
    out.push(`https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(`https://${domain}`)}&size=256`);
  }
  for (const domain of domains) {
    out.push(`https://www.google.com/s2/favicons?sz=256&domain_url=${encodeURIComponent(`https://${domain}`)}`);
  }
  for (const domain of domains) {
    out.push(`https://icon.horse/icon/${encodeURIComponent(domain)}`);
  }
  for (const domain of domains) {
    out.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`);
  }
  for (const domain of domains) {
    out.push(`https://favicon.yandex.net/favicon/${encodeURIComponent(domain)}?size=120`);
  }
  for (const domain of domains) {
    out.push(`https://api.iowen.cn/favicon/${encodeURIComponent(domain)}.png`);
  }
  for (const domain of domains) {
    out.push(`https://favicon.im/${encodeURIComponent(domain)}?larger=true`);
  }
  for (const domain of domains) {
    out.push(`https://unavatar.io/${encodeURIComponent(domain)}`);
  }
  for (const domain of domains) {
    out.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`);
  }

  return out;
}

function dedupe(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function detectImageMime(buffer, contentType, url) {
  const declared = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (declared.startsWith('image/')) return declared;

  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a')) return 'image/gif';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) return 'image/x-icon';

  const head = buffer.subarray(0, Math.min(buffer.length, 256)).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || head.includes('<svg')) return 'image/svg+xml';

  const lowerUrl = String(url || '').toLowerCase();
  if (lowerUrl.endsWith('.ico')) return 'image/x-icon';
  if (lowerUrl.endsWith('.svg')) return 'image/svg+xml';
  if (lowerUrl.endsWith('.png')) return 'image/png';
  if (lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerUrl.endsWith('.webp')) return 'image/webp';

  return null;
}

async function fetchImageCandidate(url) {
  const {response, finalUrl} = await fetchWithRedirects(url, {
    headers: {
      accept: 'image/avif,image/webp,image/png,image/svg+xml,image/x-icon,image/*,*/*;q=0.6',
      'user-agent': USER_AGENT,
      referer: new URL(url).origin,
    },
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  if (!response.ok) return null;
  const body = await readBodyLimited(response, MAX_IMAGE_BYTES);
  if (!body.byteLength) return null;

  const contentType = detectImageMime(body, response.headers.get('content-type'), finalUrl);
  if (!contentType) return null;
  return {body, contentType, source: finalUrl};
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function firstResolvedImage(promises) {
  return await new Promise((resolve) => {
    if (!promises.length) {
      resolve(null);
      return;
    }

    let remaining = promises.length;
    let settled = false;
    for (const promise of promises) {
      promise
        .then((value) => {
          if (settled) return;
          if (value) {
            settled = true;
            resolve(value);
            return;
          }
          remaining -= 1;
          if (remaining <= 0) resolve(null);
        })
        .catch(() => {
          if (settled) return;
          remaining -= 1;
          if (remaining <= 0) resolve(null);
        });
    }
  });
}

async function fetchFirstImageCandidate(candidates, batchSize = 4) {
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const image = await firstResolvedImage(batch.map((candidate) => fetchImageCandidate(candidate)));
    if (image) return image;
  }
  return null;
}

export async function fetchFaviconProxyPayload(rawUrl) {
  const target = normalizeTargetUrl(rawUrl);
  await assertPublicHttpUrl(target);

  const declaredPromise = getDeclaredCandidates(target.toString());
  const fastDeclared = await Promise.race([
    declaredPromise,
    sleep(900).then(() => []),
  ]);

  const providerCandidates = buildProviderCandidates(target.toString());
  const commonOriginCandidates = buildCommonOriginCandidates(target.toString());
  const fastCandidates = dedupe([
    ...fastDeclared,
    ...providerCandidates.slice(0, 6),
    ...commonOriginCandidates,
    ...providerCandidates.slice(6),
  ]);
  const fastImage = await fetchFirstImageCandidate(fastCandidates, 4);
  if (fastImage) return fastImage;

  const declared = await declaredPromise.catch(() => []);
  const lateDeclared = dedupe(declared.filter((candidate) => !fastCandidates.includes(candidate)));
  if (lateDeclared.length) {
    const lateImage = await fetchFirstImageCandidate(lateDeclared, 4);
    if (lateImage) return lateImage;
  }

  throw createHttpError(404, 'Favicon not found');
}
