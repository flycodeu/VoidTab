// src/core/system/systemStats.ts
export type GeoInfo = {
    ip?: string;
    country?: string;
    region?: string;
    city?: string;
};

export type SystemStats = {
    updatedAt: number;

    net: {
        effectiveType?: string;   // 4g/3g/...
        downlinkMbps?: number;    // 估算下行 Mbps（不是测速）
        rttMs?: number;           // 估算 RTT（不是你自己的 ping）
        saveData?: boolean;
    };

    latencyMs?: number;         //   用 fetch HEAD/GET 测的 HTTP RTT
    cpu: {
        logicalCores?: number;
        usagePercent?: number;    //   仅在 chrome.system.cpu 可用时给出
    };

    memory: {
        deviceMemoryGB?: number;  // navigator.deviceMemory
        jsHeapUsedMB?: number;    // performance.memory（Chromium）
        jsHeapLimitMB?: number;

        totalMB?: number;         //   chrome.system.memory 可用时给出
        availableMB?: number;
        usedPercent?: number;     //   total/available 可用时给出
    };

    geo?: GeoInfo;              //   只有你配置 geoUrl 才会取
    browser: {
        ua: string;
        platform?: string;
    };
};

type CollectOpts = {
    /** 可选：用于测 latency 的轻量 URL（建议同源 /ping 或一个静态小资源） */
    pingUrl?: string;
    /** 可选：公网 IP/国家信息接口（你自己提供），不配就不取 */
    geoUrl?: string;
    /** latency 超时 */
    pingTimeoutMs?: number;
};

const getConn = () =>
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

const hasChromeSystem = () => {
    const c: any = (globalThis as any).chrome;
    return !!(c?.system?.cpu && c?.system?.memory);
};

/** --------- HTTP RTT（通用，无需扩展权限）--------- */
export async function httpRttMs(url: string, timeoutMs = 3000): Promise<number> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    const start = performance.now();
    try {
        // HEAD 有时被服务端禁用；失败就 fallback GET
        const res = await fetch(url, {method: 'HEAD', cache: 'no-store', signal: ctrl.signal});
        if (!res.ok) throw new Error('HEAD not ok');
        return Math.round(performance.now() - start);
    } catch {
        const start2 = performance.now();
        await fetch(url, {method: 'GET', cache: 'no-store', signal: ctrl.signal});
        return Math.round(performance.now() - start2);
    } finally {
        clearTimeout(t);
    }
}

/** --------- Geo（可选）--------- */
async function fetchGeo(geoUrl: string): Promise<GeoInfo> {
    const res = await fetch(geoUrl, {cache: 'no-store'});
    if (!res.ok) return {};
    const data = await res.json().catch(() => ({}));
    return {
        ip: data.ip,
        country: data.country,
        region: data.region,
        city: data.city,
    };
}

/** --------- chrome.system.cpu usage% 采样（可选增强）--------- */
let lastCpuAgg: { idle: number; total: number } | null = null;

async function chromeCpuUsagePercent(): Promise<number | undefined> {
    const c: any = (globalThis as any).chrome;
    const info = await new Promise<any>((resolve, reject) => {
        try {
            c.system.cpu.getInfo((v: any) => resolve(v));
        } catch (e) {
            reject(e);
        }
    });

    const processors: any[] = info?.processors || [];
    if (!processors.length) return undefined;

    let total = 0;
    let idle = 0;

    for (const p of processors) {
        const u = p.usage;
        if (!u) continue;
        total += (u.total ?? 0);
        idle += (u.idle ?? 0);
    }

    const nowAgg = {total, idle};

    if (!lastCpuAgg) {
        lastCpuAgg = nowAgg;
        return undefined; // 第一次没法算 delta
    }

    const deltaTotal = nowAgg.total - lastCpuAgg.total;
    const deltaIdle = nowAgg.idle - lastCpuAgg.idle;
    lastCpuAgg = nowAgg;

    if (deltaTotal <= 0) return undefined;
    const used = deltaTotal - deltaIdle;
    const pct = Math.max(0, Math.min(100, Math.round((used / deltaTotal) * 100)));
    return pct;
}

/** --------- chrome.system.memory（可选增强）--------- */
async function chromeMemoryInfo(): Promise<{ totalMB?: number; availableMB?: number }> {
    const c: any = (globalThis as any).chrome;
    const info = await new Promise<any>((resolve, reject) => {
        try {
            c.system.memory.getInfo((v: any) => resolve(v));
        } catch (e) {
            reject(e);
        }
    });

    const totalMB = info?.capacity ? Math.round(info.capacity / 1024 / 1024) : undefined;
    const availableMB = info?.availableCapacity ? Math.round(info.availableCapacity / 1024 / 1024) : undefined;

    return {totalMB, availableMB};
}

/**   你要的：collectSystemStats（通用 + 自动增强） */
export async function collectSystemStats(opts: CollectOpts = {}): Promise<SystemStats> {
    const conn = getConn();

    const net: SystemStats['net'] = {
        effectiveType: conn?.effectiveType,
        downlinkMbps: typeof conn?.downlink === 'number' ? conn.downlink : undefined,
        rttMs: typeof conn?.rtt === 'number' ? conn.rtt : undefined,
        saveData: !!conn?.saveData,
    };

    const cpu: SystemStats['cpu'] = {
        logicalCores: (navigator as any).hardwareConcurrency,
    };

    const perfMem: any = (performance as any).memory;
    const memory: SystemStats['memory'] = {
        deviceMemoryGB: (navigator as any).deviceMemory,
        jsHeapUsedMB: perfMem?.usedJSHeapSize ? Math.round(perfMem.usedJSHeapSize / 1024 / 1024) : undefined,
        jsHeapLimitMB: perfMem?.jsHeapSizeLimit ? Math.round(perfMem.jsHeapSizeLimit / 1024 / 1024) : undefined,
    };

    //   可选增强：chrome.system.*
    if (hasChromeSystem()) {
        try {
            const [cpuPct, memExt] = await Promise.all([
                chromeCpuUsagePercent(),
                chromeMemoryInfo(),
            ]);

            if (typeof cpuPct === 'number') cpu.usagePercent = cpuPct;

            memory.totalMB = memExt.totalMB;
            memory.availableMB = memExt.availableMB;

            if (memory.totalMB && typeof memory.availableMB === 'number') {
                const usedMB = memory.totalMB - memory.availableMB;
                memory.usedPercent = Math.max(0, Math.min(100, Math.round((usedMB / memory.totalMB) * 100)));
            }
        } catch {
            // ignore
        }
    }

    let latencyMs: number | undefined;
    if (opts.pingUrl) {
        try {
            latencyMs = await httpRttMs(opts.pingUrl, opts.pingTimeoutMs ?? 3000);
        } catch {
            latencyMs = undefined;
        }
    }

    let geo: GeoInfo | undefined;
    if (opts.geoUrl) {
        try {
            geo = await fetchGeo(opts.geoUrl);
        } catch {
            geo = undefined;
        }
    }

    return {
        updatedAt: Date.now(),
        net,
        latencyMs,
        cpu,
        memory,
        geo,
        browser: {
            ua: navigator.userAgent,
            platform: (navigator as any).platform,
        },
    };
}
