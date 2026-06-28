// 音乐组件的服务抽象。
// - audio：直链音频，走原生 <audio>，默认预设使用它，避免第三方 iframe 跨域脚本问题。
// - 其他 provider：第三方嵌入 iframe，仅用于用户手动配置。
// 设计见 docs/music-ambient-and-embed-design.md
import type {MusicEmbedProviderId, MusicEmbedWidgetState} from '../../../../core/config/types';

export type ParsedResource = {
    provider: MusicEmbedProviderId;
    kind: string;
    resourceId: string;
};

export interface MusicProvider {
    id: MusicEmbedProviderId;
    label: string;
    /** 占位/示例文本 */
    placeholder: string;
    /** 从用户输入（分享链接 / 纯 id）解析资源；解析失败返回 null */
    parse(input: string): ParsedResource | null;
    /** 由保存的状态拼出可播放/可嵌入的资源 URL */
    buildEmbedUrl(state: MusicEmbedWidgetState): string;
}

export function isBlockedMusicSource(state?: MusicEmbedWidgetState | null): boolean {
    if (!state) return false;
    const raw = `${state.provider} ${state.resourceId || ''} ${state.customUrl || ''}`.toLowerCase();
    return state.provider === 'netease'
        || raw.includes('music.163.com')
        || raw.includes('pt_outchain_player')
        || raw.includes('outchain/player');
}

const audio: MusicProvider = {
    id: 'audio',
    label: '音频直链',
    placeholder: 'https://example.com/music.mp3 / .ogg / .wav / .m4a',
    parse(input) {
        const text = input.trim();
        if (!/^https?:\/\//.test(text)) return null;
        if (!/\.(mp3|ogg|oga|wav|m4a|aac)(\?|#|$)/i.test(text)) return null;
        return {provider: 'audio', kind: 'track', resourceId: text};
    },
    buildEmbedUrl(state) {
        return state.customUrl || state.resourceId || '';
    },
};

// Spotify embed
const SPOTIFY_KINDS = new Set(['track', 'playlist', 'album', 'artist', 'show', 'episode']);
const spotify: MusicProvider = {
    id: 'spotify',
    label: 'Spotify',
    placeholder: 'https://open.spotify.com/playlist/...',
    parse(input) {
        const text = input.trim();
        const m = text.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|playlist|album|artist|show|episode)\/([A-Za-z0-9]+)/);
        if (!m) return null;
        return {provider: 'spotify', kind: m[1], resourceId: m[2]};
    },
    buildEmbedUrl(state) {
        const kind = SPOTIFY_KINDS.has(state.kind) ? state.kind : 'track';
        return `https://open.spotify.com/embed/${kind}/${encodeURIComponent(state.resourceId)}`;
    },
};

// YouTube embed
const youtube: MusicProvider = {
    id: 'youtube',
    label: 'YouTube',
    placeholder: 'https://www.youtube.com/watch?v=... 或播放列表链接',
    parse(input) {
        const text = input.trim();
        const list = text.match(/[?&]list=([A-Za-z0-9_-]+)/);
        if (list) return {provider: 'youtube', kind: 'playlist', resourceId: list[1]};

        const v = text.match(/[?&]v=([A-Za-z0-9_-]{6,})/)
            || text.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/)
            || text.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
        if (v) return {provider: 'youtube', kind: 'video', resourceId: v[1]};
        return null;
    },
    buildEmbedUrl(state) {
        const auto = state.autoplay ? '1' : '0';
        if (state.kind === 'playlist') {
            return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(state.resourceId)}&autoplay=${auto}`;
        }
        return `https://www.youtube.com/embed/${encodeURIComponent(state.resourceId)}?autoplay=${auto}`;
    },
};

// 自定义：直接保存完整 iframe src
const custom: MusicProvider = {
    id: 'custom',
    label: '自定义嵌入',
    placeholder: '粘贴完整的播放器 iframe 链接（https://...）',
    parse(input) {
        const text = input.trim();
        if (!/^https?:\/\//.test(text)) return null;
        return {provider: 'custom', kind: 'custom', resourceId: text};
    },
    buildEmbedUrl(state) {
        return state.customUrl || state.resourceId || '';
    },
};

/** 开箱默认：原生 audio 直链，避免默认加载网易云 iframe 的跨域脚本。 */
export const DEFAULT_MUSIC_EMBED: MusicEmbedWidgetState = {
    provider: 'audio',
    kind: 'track',
    resourceId: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    customUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    autoplay: false,
    height: 120,
    title: 'Void FM 01',
};

/** 默认预设：30 个原生 audio 曲目入口。 */
export type MusicPreset = { id: string; label: string; group: string; state: MusicEmbedWidgetState };

const track = (n: number, file: number, label?: string): MusicPreset => {
    const url = `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${file}.mp3`;
    const title = label || `Void FM ${String(n).padStart(2, '0')}`;
    return {
        id: `audio-${n}`,
        label: title,
        group: '内置歌曲',
        state: {
            provider: 'audio',
            kind: 'track',
            resourceId: url,
            customUrl: url,
            autoplay: false,
            height: 120,
            title,
        },
    };
};

// 免版权电台：SomaFM 是听众资助、合法授权的网络电台，官方允许直接引用其流地址，
// 直链可直接喂给原生 <audio>（按 content-type 播放，不依赖文件扩展名）。
// 国产流行受版权限制无法提供免费直链；如需正版华语流行，请在配置弹窗用
// 官方 Spotify / YouTube 歌单链接（这两个平台本身已获授权）。
const radio = (id: string, label: string): MusicPreset => {
    const url = `https://ice1.somafm.com/${id}-128-mp3`;
    return {
        id: `radio-${id}`,
        label,
        group: '免版权电台',
        state: {
            provider: 'audio',
            kind: 'track',
            resourceId: url,
            customUrl: url,
            autoplay: false,
            height: 120,
            title: label,
        },
    };
};

export const MUSIC_PRESETS: MusicPreset[] = [
    radio('groovesalad', 'SomaFM · Groove Salad（氛围/慢拍）'),
    radio('dronezone', 'SomaFM · Drone Zone（深空氛围）'),
    radio('lush', 'SomaFM · Lush（人声慢歌）'),
    radio('beatblender', 'SomaFM · Beat Blender（House/电子）'),
    radio('indiepop', 'SomaFM · Indie Pop Rocks（独立流行）'),
    radio('secretagent', 'SomaFM · Secret Agent（复古律动）'),
    radio('bootliquor', 'SomaFM · Boot Liquor（美式乡村）'),
    radio('fluid', 'SomaFM · Fluid（氛围嘻哈）'),
    track(1, 1, 'Void FM 01 · Morning Drive'),
    track(2, 2, 'Void FM 02 · City Pulse'),
    track(3, 3, 'Void FM 03 · Night Lane'),
    track(4, 4, 'Void FM 04 · Soft Focus'),
    track(5, 5, 'Void FM 05 · Work Mode'),
    track(6, 6, 'Void FM 06 · Blue Window'),
    track(7, 7, 'Void FM 07 · Long Coffee'),
    track(8, 8, 'Void FM 08 · Low Orbit'),
    track(9, 9, 'Void FM 09 · Terminal Rain'),
    track(10, 10, 'Void FM 10 · Clean Desk'),
    track(11, 11, 'Void FM 11 · Late Build'),
    track(12, 12, 'Void FM 12 · Quiet Router'),
    track(13, 13, 'Void FM 13 · Neon Hall'),
    track(14, 14, 'Void FM 14 · Slow Cache'),
    track(15, 15, 'Void FM 15 · After Commit'),
    track(16, 16, 'Void FM 16 · Grey Skyline'),
    track(17, 17, 'Void FM 17 · Deep Tab'),
    track(18, 1, 'Void FM 18 · Morning Drive Alt'),
    track(19, 2, 'Void FM 19 · City Pulse Alt'),
    track(20, 3, 'Void FM 20 · Night Lane Alt'),
    track(21, 4, 'Void FM 21 · Soft Focus Alt'),
    track(22, 5, 'Void FM 22 · Work Mode Alt'),
    track(23, 6, 'Void FM 23 · Blue Window Alt'),
    track(24, 7, 'Void FM 24 · Long Coffee Alt'),
    track(25, 8, 'Void FM 25 · Low Orbit Alt'),
    track(26, 9, 'Void FM 26 · Terminal Rain Alt'),
    track(27, 10, 'Void FM 27 · Clean Desk Alt'),
    track(28, 11, 'Void FM 28 · Late Build Alt'),
    track(29, 12, 'Void FM 29 · Quiet Router Alt'),
    track(30, 13, 'Void FM 30 · Neon Hall Alt'),
];

// 网易云 outchain 会在 iframe 内部访问跨域 window.document，控制台持续报 SecurityError。
// 保留解析实现仅用于兼容旧数据识别，但不再暴露为可选 provider，也不再允许渲染。
export const MUSIC_PROVIDERS: MusicProvider[] = [audio, spotify, youtube, custom];

export const MUSIC_PROVIDER_MAP: Record<MusicEmbedProviderId, MusicProvider> = Object.fromEntries(
    MUSIC_PROVIDERS.map((p) => [p.id, p]),
) as Record<MusicEmbedProviderId, MusicProvider>;

export function getMusicProvider(id?: string): MusicProvider | undefined {
    if (!id) return undefined;
    return MUSIC_PROVIDER_MAP[id as MusicEmbedProviderId];
}

export function buildMusicEmbedUrl(state?: MusicEmbedWidgetState): string {
    if (!state || !state.resourceId) return '';
    if (isBlockedMusicSource(state)) return '';
    const provider = getMusicProvider(state.provider);
    if (!provider) return '';
    return provider.buildEmbedUrl(state);
}

export function isNativeAudioSource(state?: MusicEmbedWidgetState | null): boolean {
    return state?.provider === 'audio';
}

export function buildNativeAudioUrl(state?: MusicEmbedWidgetState | null): string {
    if (!isNativeAudioSource(state)) return '';
    return state?.customUrl || state?.resourceId || '';
}
