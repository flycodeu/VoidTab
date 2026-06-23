// 内置氛围音清单（编译期常量）
// 设计见 docs/music-ambient-and-embed-design.md
//
// 两类来源：
//  - kind: 'synth' —— 用 Web Audio 实时合成的自然环境音（雨声/海浪/篝火/风声/溪流/白噪音）。
//                     零素材、零体积、即开即用，听感为自然声而非干噪音。
//  - kind: 'file'  —— 可选的随包静态资源（如真实录音 / Lo-Fi 音乐），放 public/audio/ambient/ 下。
//                     缺文件只会加载失败（静默回退），不影响构建。

export type SynthType = 'rain' | 'waves' | 'fire' | 'wind' | 'stream' | 'white';

export type AmbientSound =
    | {
        id: string;
        label: string;
        icon: string;       // Phosphor 图标名
        kind: 'synth';
        synthType: SynthType;
    }
    | {
        id: string;
        label: string;
        icon: string;
        kind: 'file';
        /** 相对 public 根的路径，引擎会用 BASE_URL 拼成完整地址 */
        file: string;
    };

export const AMBIENT_SOUNDS: AmbientSound[] = [
    {id: 'rain', label: '雨声', icon: 'CloudRain', kind: 'synth', synthType: 'rain'},
    {id: 'waves', label: '海浪', icon: 'Waves', kind: 'synth', synthType: 'waves'},
    {id: 'fire', label: '篝火', icon: 'Fire', kind: 'synth', synthType: 'fire'},
    {id: 'wind', label: '风声', icon: 'Wind', kind: 'synth', synthType: 'wind'},
    {id: 'stream', label: '溪流', icon: 'Drop', kind: 'synth', synthType: 'stream'},
    {id: 'white-noise', label: '白噪音', icon: 'WaveSine', kind: 'synth', synthType: 'white'},

    // 可选：放入真实音乐/录音后启用（需自备可商用素材）
    {id: 'lofi', label: 'Lo-Fi', icon: 'MusicNotes', kind: 'file', file: 'audio/ambient/lofi.mp3'},
];

export const AMBIENT_SOUND_MAP: Record<string, AmbientSound> = Object.fromEntries(
    AMBIENT_SOUNDS.map((s) => [s.id, s]),
);

export function getAmbientSound(id?: string): AmbientSound | undefined {
    if (!id) return undefined;
    return AMBIENT_SOUND_MAP[id];
}
