import type {HostCapabilities} from './contracts.ts';
import {getBrowserInfo, isExtensionContext} from '../../shared/utils/browser.ts';

const parseMajor = (version: string) => {
    const major = Number.parseInt(version.split('.')[0] || '0', 10);
    return Number.isFinite(major) ? major : 0;
};

export function getCurrentHostCapabilities(options: {sandboxRuntime?: boolean} = {}): HostCapabilities {
    const browserInfo = typeof navigator !== 'undefined' ? getBrowserInfo() : {name: 'unknown', version: '0'};
    const family = browserInfo.name === 'chrome' || browserInfo.name === 'edge' ? browserInfo.name : 'other';
    const extension = isExtensionContext();
    return {
        target: extension ? 'extension' : 'web',
        hostVersion: '1.0.7',
        browser: {
            family,
            version: parseMajor(browserInfo.version),
        },
        features: {
            indexedStorage: typeof indexedDB !== 'undefined',
            syncStorage: extension,
            networkProxy: true,
            clipboardWrite: typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText,
            notifications: typeof Notification !== 'undefined',
            openExternal: typeof window !== 'undefined',
            contextMenus: extension,
            localFileImport: typeof FileReader !== 'undefined',
            sandboxRuntime: options.sandboxRuntime === true && typeof HTMLIFrameElement !== 'undefined',
        },
    };
}
