// 内置氛围音清单（编译期常量）
//
// 所有内置音色均为 Web Audio 实时合成（噪声 + 滤波器 + LFO 调制），零素材、零体积、
// 即开即用，听感为自然声而非干噪音。引擎仍保留 kind:'file' 通道以便将来挂载随包音频，
// 但默认清单不再暴露任何需要外部文件的选项。

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
];

export const AMBIENT_SOUND_MAP: Record<string, AmbientSound> = Object.fromEntries(
    AMBIENT_SOUNDS.map((s) => [s.id, s]),
);

export function getAmbientSound(id?: string): AmbientSound | undefined {
    if (!id) return undefined;
    return AMBIENT_SOUND_MAP[id];
}
