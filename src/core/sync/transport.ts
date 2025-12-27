export interface HttpRequest {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
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
        const res = await fetch(req.url, {
            method: req.method,
            headers: req.headers,
            body: req.body
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
