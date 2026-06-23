import type {
    CapabilityRequirement,
    HostCapabilities,
    HostFeature,
    RuntimeTarget,
    TileCompatibility,
} from './contracts.ts';

export type CompatibilityStatus =
    | {state: 'supported'}
    | {state: 'degraded'; missingOptional: HostFeature[]; notices: string[]}
    | {state: 'unsupported'; reasons: string[]}
    | {state: 'blocked'; reasons: string[]};

export interface CompatibilityEvaluationInput {
    compatibility: TileCompatibility;
    host: HostCapabilities;
    grantedRequiredFeatures?: readonly HostFeature[];
}

const parseVersion = (version: string) => version.split('.').map((part) => Number.parseInt(part, 10) || 0);

export function compareVersions(left: string, right: string) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
        const delta = (a[index] || 0) - (b[index] || 0);
        if (delta !== 0) return delta > 0 ? 1 : -1;
    }
    return 0;
}

const targetName = (target: RuntimeTarget) => target === 'extension' ? '浏览器扩展模式' : '网页模式';

const requirementList = (compatibility: TileCompatibility) => compatibility.capabilities || [];

const missingHostFeatures = (requirements: CapabilityRequirement[], host: HostCapabilities, level: 'required' | 'optional') =>
    requirements
        .filter((requirement) => requirement.level === level && !host.features[requirement.feature])
        .map((requirement) => requirement.feature);

/**
 * P0 compatibility evaluator. Permission grants are deliberately separate from
 * platform support, so a package cannot mistake a supported host for user consent.
 */
export function evaluateTileCompatibility(input: CompatibilityEvaluationInput): CompatibilityStatus {
    const {compatibility, host} = input;
    if (!compatibility.targets.includes(host.target)) {
        return {state: 'unsupported', reasons: [`该组件不支持${targetName(host.target)}`]};
    }
    if (compareVersions(host.hostVersion, compatibility.minHostVersion) < 0) {
        return {state: 'unsupported', reasons: [`需要 VoidTab ${compatibility.minHostVersion} 或更高版本`]};
    }

    const minBrowser = host.browser.family === 'chrome' || host.browser.family === 'edge'
        ? compatibility.minBrowserVersion?.[host.browser.family]
        : undefined;
    if (minBrowser && host.browser.version < minBrowser) {
        return {state: 'unsupported', reasons: [`需要 ${host.browser.family} ${minBrowser} 或更高版本`]};
    }

    const requirements = requirementList(compatibility);
    const unavailableRequired = missingHostFeatures(requirements, host, 'required');
    if (unavailableRequired.length) {
        return {state: 'unsupported', reasons: unavailableRequired.map((feature) => `当前环境不支持 ${feature}`)};
    }

    const granted = new Set(input.grantedRequiredFeatures || []);
    const blocked = requirements
        .filter((requirement) => requirement.level === 'required' && !granted.has(requirement.feature))
        .map((requirement) => requirement.feature);
    if (blocked.length) {
        return {state: 'blocked', reasons: blocked.map((feature) => `需要授权 ${feature}`)};
    }

    const missingOptional = missingHostFeatures(requirements, host, 'optional');
    if (missingOptional.length) {
        return {
            state: 'degraded',
            missingOptional,
            notices: missingOptional.map((feature) => `当前环境不支持可选能力 ${feature}`),
        };
    }
    return {state: 'supported'};
}

