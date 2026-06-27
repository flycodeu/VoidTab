import type {
    HostCapabilities,
    HostFeature,
    RuntimeTarget,
    TileCompatibility,
    TileInstallRecord,
} from './contracts.ts';
import {compareVersions, evaluateTileCompatibility, type CompatibilityStatus} from './compatibility.ts';

export type PackageReleaseGateProfile = 'desktop' | 'mobile';
export type PackageReleaseGatePermissionMode = 'granted' | 'denied';

export interface PackageReleaseGateCase {
    id: string;
    target: RuntimeTarget;
    profile: PackageReleaseGateProfile;
    permissionMode: PackageReleaseGatePermissionMode;
    hostVersion: string;
    compatibilityState: CompatibilityStatus['state'];
    mobileState: 'full' | 'fallback-layout' | 'desktop-only';
    ok: boolean;
    messages: string[];
}

export interface PackageReleaseGateReport {
    ok: boolean;
    cases: PackageReleaseGateCase[];
    failures: PackageReleaseGateCase[];
}

const ALL_FEATURES: Record<HostFeature, boolean> = {
    indexedStorage: true,
    syncStorage: true,
    networkProxy: true,
    clipboardWrite: true,
    notifications: true,
    openExternal: true,
    contextMenus: true,
    localFileImport: true,
    sandboxRuntime: true,
};

const cloneFeaturesForTarget = (target: RuntimeTarget): Record<HostFeature, boolean> => ({
    ...ALL_FEATURES,
    syncStorage: target === 'extension',
    contextMenus: target === 'extension',
});

function createGateHost(target: RuntimeTarget, hostVersion: string): HostCapabilities {
    return {
        target,
        hostVersion,
        browser: {family: 'chrome', version: 120},
        features: cloneFeaturesForTarget(target),
    };
}

function previousVersion(version: string): string {
    const parts = version.split('.').map((part) => Number.parseInt(part, 10) || 0);
    while (parts.length < 3) parts.push(0);
    for (let index = parts.length - 1; index >= 0; index -= 1) {
        if (parts[index] > 0) {
            parts[index] -= 1;
            return parts.join('.');
        }
    }
    return '0.0.0';
}

const requiredFeatures = (compatibility: TileCompatibility): HostFeature[] =>
    (compatibility.capabilities || [])
        .filter((requirement) => requirement.level === 'required')
        .map((requirement) => requirement.feature);

const statusMessages = (status: CompatibilityStatus): string[] => {
    if (status.state === 'supported') return [];
    if (status.state === 'degraded') return status.notices;
    return status.reasons;
};

function evaluateCase(
    compatibility: TileCompatibility,
    target: RuntimeTarget,
    profile: PackageReleaseGateProfile,
    permissionMode: PackageReleaseGatePermissionMode,
    hostVersion: string,
): PackageReleaseGateCase {
    const required = requiredFeatures(compatibility);
    const status = evaluateTileCompatibility({
        compatibility,
        host: createGateHost(target, hostVersion),
        grantedRequiredFeatures: permissionMode === 'granted' ? required : [],
    });
    const targetDeclared = compatibility.targets.includes(target);
    const belowMinHost = compareVersions(hostVersion, compatibility.minHostVersion) < 0;
    const mobileState = profile === 'mobile' ? compatibility.mobileSupport : 'full';
    const mobileMessage = mobileState === 'desktop-only'
        ? '移动端 profile 应显示桌面端占位'
        : mobileState === 'fallback-layout'
            ? '移动端 profile 应使用 fallback layout'
            : '';
    const expectsBlockedPermission = targetDeclared
        && !belowMinHost
        && permissionMode === 'denied'
        && required.length > 0
        && required.every((feature) => createGateHost(target, hostVersion).features[feature]);
    const ok = belowMinHost
        ? status.state === 'unsupported'
        : !targetDeclared
            ? status.state === 'unsupported'
            : expectsBlockedPermission
                ? status.state === 'blocked'
                : status.state !== 'unsupported';

    return {
        id: `${target}:${profile}:${permissionMode}:${hostVersion}`,
        target,
        profile,
        permissionMode,
        hostVersion,
        compatibilityState: status.state,
        mobileState,
        ok,
        messages: [
            ...statusMessages(status),
            ...(mobileMessage ? [mobileMessage] : []),
        ],
    };
}

export function evaluatePackageReleaseGate(
    compatibility: TileCompatibility,
): PackageReleaseGateReport {
    const targets: RuntimeTarget[] = ['web', 'extension'];
    const profiles: PackageReleaseGateProfile[] = ['desktop', 'mobile'];
    const permissionModes: PackageReleaseGatePermissionMode[] = ['granted', 'denied'];
    const hostVersions = [...new Set([
        compatibility.minHostVersion,
        previousVersion(compatibility.minHostVersion),
    ])];
    const cases = targets.flatMap((target) =>
        profiles.flatMap((profile) =>
            permissionModes.flatMap((permissionMode) =>
                hostVersions.map((hostVersion) =>
                    evaluateCase(compatibility, target, profile, permissionMode, hostVersion),
                ),
            ),
        ),
    );
    const failures = cases.filter((item) => !item.ok);
    return {ok: failures.length === 0, cases, failures};
}

export function evaluateTileInstallReleaseGate(
    install: TileInstallRecord,
): PackageReleaseGateReport {
    const compatibility = install.manifest?.compatibility;
    if (!compatibility) {
        const failure: PackageReleaseGateCase = {
            id: `${install.tileType}:missing-compatibility`,
            target: 'web',
            profile: 'desktop',
            permissionMode: 'granted',
            hostVersion: '',
            compatibilityState: 'unsupported',
            mobileState: 'full',
            ok: false,
            messages: ['组件包缺少 manifest.compatibility'],
        };
        return {ok: false, cases: [failure], failures: [failure]};
    }
    return evaluatePackageReleaseGate(compatibility);
}
