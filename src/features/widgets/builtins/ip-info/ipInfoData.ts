import {tempStorage} from '../../../../core/storage/tempStorage';
import {fetchJsonWithRetry} from '../../../../shared/utils/network';

export type IpInfo = {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  isp: string;
  asn: string;
  timezone: string;
  provider: string;
  fetchedAt: number;
  raw: unknown;
};

const CACHE_TIME = 20 * 60 * 1000;

export const readCachedIpInfo = () => {
  const cache = tempStorage.get('ipInfo');
  if (!cache?.data) return null;
  return tempStorage.isValid(cache.ts, CACHE_TIME) ? cache.data as IpInfo : null;
};

const text = (value: unknown) => String(value || '').trim();

const normalizeIpWhoIs = (data: any): IpInfo => ({
  ip: text(data.ip),
  country: text(data.country),
  countryCode: text(data.country_code),
  region: text(data.region),
  city: text(data.city),
  isp: text(data.isp),
  asn: text(data.asn),
  timezone: text(data.timezone?.id || data.timezone?.utc),
  provider: 'ipwho.is',
  fetchedAt: Date.now(),
  raw: data,
});

const normalizeIpApi = (data: any): IpInfo => ({
  ip: text(data.ip),
  country: text(data.country_name),
  countryCode: text(data.country_code),
  region: text(data.region),
  city: text(data.city),
  isp: text(data.org),
  asn: text(data.asn),
  timezone: text(data.timezone),
  provider: 'ipapi.co',
  fetchedAt: Date.now(),
  raw: data,
});

const normalizeIpSb = (data: any): IpInfo => ({
  ip: text(data.ip),
  country: text(data.country),
  countryCode: text(data.country_code),
  region: text(data.region),
  city: text(data.city),
  isp: text(data.isp),
  asn: text(data.asn),
  timezone: text(data.timezone),
  provider: 'api.ip.sb',
  fetchedAt: Date.now(),
  raw: data,
});

const ensureUsable = (info: IpInfo) => {
  if (!info.ip) throw new Error(`${info.provider} returned empty ip`);
  return info;
};

export async function fetchIpInfo(force = false): Promise<IpInfo> {
  const cached = readCachedIpInfo();
  if (!force && cached) return cached;

  const existing = tempStorage.get('ipInfo')?.data as IpInfo | undefined;
  const errors: string[] = [];

  const providers: Array<() => Promise<IpInfo>> = [
    async () => ensureUsable(normalizeIpWhoIs(await fetchJsonWithRetry<any>(
        'https://ipwho.is/',
        {cache: 'no-store'},
        {
          timeoutMs: 3500,
          retries: 1,
          metricName: 'ip.info.ipwhois',
        }
    ))),
    async () => ensureUsable(normalizeIpApi(await fetchJsonWithRetry<any>(
        'https://ipapi.co/json/',
        {cache: 'no-store'},
        {
          timeoutMs: 3500,
          retries: 1,
          metricName: 'ip.info.ipapi',
        }
    ))),
    async () => ensureUsable(normalizeIpSb(await fetchJsonWithRetry<any>(
        'https://api.ip.sb/geoip',
        {cache: 'no-store'},
        {
          timeoutMs: 3500,
          retries: 1,
          metricName: 'ip.info.ipsb',
        }
    ))),
  ];

  for (const provider of providers) {
    try {
      const info = await provider();
      tempStorage.set('ipInfo', {data: info, provider: info.provider, ts: Date.now()});
      return info;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (existing?.ip) return existing;
  throw new Error(errors.join('; ') || 'IP info unavailable');
}
