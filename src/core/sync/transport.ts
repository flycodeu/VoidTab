import {fetchWithRetry} from '../../shared/utils/network';

export interface HttpRequest {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    retries?: number;
}

export interface HttpResponse {
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string>;

    text(): Promise<string>;
}

export interface HttpTransport {
    request(req: HttpRequest): Promise<HttpResponse>;
}

/**
 * 默认 Web 环境 transport：window.fetch
 * 扩展版你可以在 background 里实现一个 transport，绕过页面 CORS 限制。
 */
export class FetchTransport implements HttpTransport {
    async request(req: HttpRequest): Promise<HttpResponse> {
        const res = await fetchWithRetry(req.url, {
            method: req.method,
            headers: req.headers,
            body: req.body
        }, {
            timeoutMs: req.timeoutMs ?? 12000,
            retries: req.retries ?? 2,
            retryDelayMs: 400,
            metricName: `sync.transport.${req.method.toLowerCase()}`,
            fallbackName: `sync.transport.${req.method.toLowerCase()}.unavailable`,
            fallback: () => new Response('', {status: 503, statusText: 'Service Unavailable'}),
        });

        const headersObj: Record<string, string> = {};
        res.headers.forEach((v, k) => (headersObj[k.toLowerCase()] = v));

        return {
            ok: res.ok,
            status: res.status,
            statusText: res.statusText,
            headers: headersObj,
            text: async () => await res.text()
        };
    }
}
