// 氛围音播放引擎：进程内单例，命令式 API。
// - synth 类：用 Web Audio 实时合成自然环境音（噪声 + 滤波器 + LFO 调制），听感为雨/浪/火/风/溪。
// - 文件类：单个 HTMLAudioElement + loop（流式解码，内存只占当前一条）。
// 状态（enabled/currentId/volume）由 config.audio 持有，本模块只负责"执行"。
// 由 AmbientController.vue 单点驱动，避免多组件重复播放。

import {ref, readonly} from 'vue';
import type {AmbientSound, SynthType} from './ambientSounds';

const _isPlaying = ref(false);
const _activeId = ref<string | null>(null);
/** 自动播放被浏览器拦截、等待用户手势时为 true */
const _blocked = ref(false);

export const ambientIsPlaying = readonly(_isPlaying);
export const ambientActiveId = readonly(_activeId);
export const ambientBlocked = readonly(_blocked);

let volume = 0.5;

// --- 文件式 ---
let audioEl: HTMLAudioElement | null = null;

function getAudioEl(): HTMLAudioElement {
    if (!audioEl) {
        audioEl = new Audio();
        audioEl.loop = true;
        audioEl.preload = 'auto';
    }
    return audioEl;
}

// --- 合成（Web Audio） ---
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
// 活动节点（音源 / LFO 振荡器），停止时统一拆除
let activeSources: AudioScheduledSourceNode[] = [];
const noiseBufferCache = new Map<'white' | 'brown', AudioBuffer>();

function getAudioCtx(): AudioContext {
    if (!audioCtx) {
        const Ctor = window.AudioContext || (window as any).webkitAudioContext;
        audioCtx = new Ctor();
    }
    return audioCtx;
}

function getNoiseBuffer(ctx: AudioContext, color: 'white' | 'brown'): AudioBuffer {
    const cached = noiseBufferCache.get(color);
    if (cached) return cached;

    const length = ctx.sampleRate * 3; // 3s 循环，降低周期感
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    if (color === 'white') {
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    } else {
        let last = 0;
        for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            last = (last + 0.02 * white) / 1.02;
            data[i] = last * 3.5;
        }
    }

    noiseBufferCache.set(color, buffer);
    return buffer;
}

function makeNoise(ctx: AudioContext, color: 'white' | 'brown'): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx, color);
    src.loop = true;
    return src;
}

/** 低频振荡器调制某个参数：param = base + depth * sin(2π·freq·t) */
function makeLFO(ctx: AudioContext, freq: number, depth: number, target: AudioParam, base: number) {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = depth;
    target.value = base;
    osc.connect(gain).connect(target);
    return osc;
}

/** 按类型构建合成图，连接到 masterGain，并把需要 start 的节点收集起来 */
function buildSynth(ctx: AudioContext, type: SynthType, out: GainNode) {
    const sources: AudioScheduledSourceNode[] = [];

    if (type === 'rain') {
        // 高频嘶嘶（雨点）
        const hiss = makeNoise(ctx, 'white');
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 700;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 7000;
        const hissGain = ctx.createGain();
        hissGain.gain.value = 0.5;
        hiss.connect(hp).connect(lp).connect(hissGain).connect(out);
        // 低频雨幕
        const rumble = makeNoise(ctx, 'brown');
        const rlp = ctx.createBiquadFilter();
        rlp.type = 'lowpass';
        rlp.frequency.value = 700;
        const rg = ctx.createGain();
        rg.gain.value = 0.35;
        rumble.connect(rlp).connect(rg).connect(out);
        // 轻微强弱起伏
        const lfo = makeLFO(ctx, 0.25, 0.08, hissGain.gain, 0.5);
        sources.push(hiss, rumble, lfo);
    } else if (type === 'waves') {
        const src = makeNoise(ctx, 'brown');
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 550;
        const swell = ctx.createGain();
        src.connect(lp).connect(swell).connect(out);
        // 缓慢的潮起潮落
        const lfo = makeLFO(ctx, 0.09, 0.42, swell.gain, 0.5);
        sources.push(src, lfo);
    } else if (type === 'fire') {
        // 低频轰鸣
        const base = makeNoise(ctx, 'brown');
        const blp = ctx.createBiquadFilter();
        blp.type = 'lowpass';
        blp.frequency.value = 1100;
        const bg = ctx.createGain();
        bg.gain.value = 0.5;
        base.connect(blp).connect(bg).connect(out);
        // 噼啪爆裂感
        const crk = makeNoise(ctx, 'white');
        const chp = ctx.createBiquadFilter();
        chp.type = 'bandpass';
        chp.frequency.value = 2600;
        chp.Q.value = 0.8;
        const cg = ctx.createGain();
        crk.connect(chp).connect(cg).connect(out);
        const lfo = makeLFO(ctx, 7, 0.22, cg.gain, 0.25);
        sources.push(base, crk, lfo);
    } else if (type === 'wind') {
        const src = makeNoise(ctx, 'white');
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 0.7;
        const g = ctx.createGain();
        g.gain.value = 0.5;
        src.connect(bp).connect(g).connect(out);
        // 呼啸：扫频 + 强弱
        const sweep = makeLFO(ctx, 0.07, 320, bp.frequency, 520);
        const breath = makeLFO(ctx, 0.13, 0.25, g.gain, 0.5);
        sources.push(src, sweep, breath);
    } else if (type === 'stream') {
        const src = makeNoise(ctx, 'white');
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1500;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 9000;
        const g = ctx.createGain();
        g.gain.value = 0.4;
        src.connect(hp).connect(lp).connect(g).connect(out);
        // 细碎流动感
        const trickle = makeLFO(ctx, 5.5, 0.12, g.gain, 0.4);
        sources.push(src, trickle);
    } else {
        // white
        const src = makeNoise(ctx, 'white');
        const g = ctx.createGain();
        g.gain.value = 0.5;
        src.connect(g).connect(out);
        sources.push(src);
    }

    return sources;
}

function teardownSynth() {
    for (const node of activeSources) {
        try {
            node.stop();
        } catch {
            // already stopped
        }
        try {
            node.disconnect();
        } catch {
            // ignore
        }
    }
    activeSources = [];
    if (masterGain) {
        try {
            masterGain.disconnect();
        } catch {
            // ignore
        }
        masterGain = null;
    }
}

function stopFile() {
    if (audioEl) audioEl.pause();
}

/** 应用音量到当前活动的音源 */
export function setAmbientVolume(v: number) {
    volume = Math.max(0, Math.min(1, v));
    if (audioEl) audioEl.volume = volume;
    if (masterGain) masterGain.gain.value = volume;
}

/** 立即停止全部播放 */
export function stopAmbient() {
    stopFile();
    teardownSynth();
    _isPlaying.value = false;
    _activeId.value = null;
    _blocked.value = false;
}

/**
 * 播放指定氛围音。
 * @returns true 表示已开始播放；false 表示被浏览器自动播放策略拦截（需用户手势）。
 */
export async function playAmbient(sound: AmbientSound, v = volume): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    volume = Math.max(0, Math.min(1, v));

    if (sound.kind === 'file') {
        teardownSynth();
        const el = getAudioEl();
        const url = `${import.meta.env.BASE_URL}${sound.file}`;
        if (!el.src.endsWith(sound.file)) el.src = url;
        el.loop = true;
        el.volume = volume;
        try {
            await el.play();
            _isPlaying.value = true;
            _activeId.value = sound.id;
            _blocked.value = false;
            return true;
        } catch {
            _isPlaying.value = false;
            _activeId.value = sound.id;
            _blocked.value = true;
            return false;
        }
    }

    // synth
    stopFile();
    const ctx = getAudioCtx();
    try {
        if (ctx.state === 'suspended') await ctx.resume();
    } catch {
        // ignore
    }
    if (ctx.state !== 'running') {
        _isPlaying.value = false;
        _activeId.value = sound.id;
        _blocked.value = true;
        return false;
    }

    teardownSynth();
    masterGain = ctx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(ctx.destination);

    const sources = buildSynth(ctx, sound.synthType, masterGain);
    for (const s of sources) s.start();
    activeSources = sources;

    _isPlaying.value = true;
    _activeId.value = sound.id;
    _blocked.value = false;
    return true;
}
