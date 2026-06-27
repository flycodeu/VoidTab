// 全局音乐播放器（会话级单例 + 本地持久化）。
// 设计见 docs/music-ambient-and-embed-design.md —— 播放器常驻 App 根、永不随网格卸载，
// 因此切分组/专注/编辑模式都不会中断音乐。网格里的音乐组件只是"启动器"。
// 状态本地持久化（不进云同步），刷新/新标签页后自动恢复为唱片态，解决"播放器消失"的困惑。
import {defineStore} from 'pinia';
import type {MusicEmbedWidgetState} from '../core/config/types';
import {storage} from '../core/storage';
import {DEFAULT_MUSIC_EMBED, isBlockedMusicSource} from '../features/widgets/builtins/music-embed/providers';

const STORE_KEY = 'voidtab_music_player';
export const MUSIC_PLAYER_PLAY_REQUEST = 'voidtab:music-player:play-request';

type PlayerPos = { x: number; y: number } | null;

type State = {
    source: MusicEmbedWidgetState | null;
    visible: boolean;
    expanded: boolean;
    playRequestId: number;
    lastError: string;
    /** 拖拽后的左上角坐标；null = 默认右下角 */
    pos: PlayerPos;
    hydrated: boolean;
};

type Persisted = { source: MusicEmbedWidgetState | null; visible: boolean; pos: PlayerPos };
export type MusicPlayerPlayRequestDetail = { requestId: number; source: MusicEmbedWidgetState };

function sanitizeMusicSource(source: MusicEmbedWidgetState | null): MusicEmbedWidgetState | null {
    if (!source) return null;
    return isBlockedMusicSource(source) ? {...DEFAULT_MUSIC_EMBED} : source;
}

function dispatchPlayRequest(detail: MusicPlayerPlayRequestDetail) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<MusicPlayerPlayRequestDetail>(MUSIC_PLAYER_PLAY_REQUEST, {detail}));
}

export const useMusicPlayer = defineStore('musicPlayer', {
    state: (): State => ({
        source: null,
        visible: false,
        expanded: true,
        playRequestId: 0,
        lastError: '',
        pos: null,
        hydrated: false,
    }),
    getters: {
        isActiveSource: (state) => (s?: MusicEmbedWidgetState | null) => {
            if (!s || !state.source || !state.visible) return false;
            return state.source.provider === s.provider
                && state.source.resourceId === s.resourceId
                && (state.source.customUrl || '') === (s.customUrl || '')
                && (state.source.title || '') === (s.title || '');
        },
    },
    actions: {
        persist() {
            const data: Persisted = {source: this.source, visible: this.visible, pos: this.pos};
            void storage.set(STORE_KEY, data, 'local');
        },
        async hydrate() {
            if (this.hydrated) return;
            this.hydrated = true;
            const data = await storage.get<Persisted | null>(STORE_KEY, null, 'local');
            if (data && data.source && data.visible) {
                this.source = sanitizeMusicSource(data.source);
                this.visible = true;
                this.pos = data.pos ?? null;
                // 刷新后默认收起为唱片，避免每次新标签页都弹出大面板（且自动播放本就被拦）
                this.expanded = false;
                if (this.source !== data.source) this.persist();
            }
        },
        play(source: MusicEmbedWidgetState) {
            const next = sanitizeMusicSource(source) || {...DEFAULT_MUSIC_EMBED};
            this.source = next;
            this.visible = true;
            this.expanded = true;
            this.lastError = '';
            this.playRequestId += 1;
            this.persist();
            dispatchPlayRequest({requestId: this.playRequestId, source: next});
        },
        clearPlaybackError() {
            this.lastError = '';
        },
        setPlaybackError(message: string) {
            this.lastError = message;
        },
        toggleExpand() {
            this.expanded = !this.expanded;
        },
        setPos(pos: PlayerPos) {
            this.pos = pos;
            this.persist();
        },
        close() {
            this.visible = false;
            this.source = null;
            this.lastError = '';
            this.persist();
        },
    },
});
