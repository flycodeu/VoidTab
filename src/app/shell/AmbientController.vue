<script setup lang="ts">
// 氛围音控制器：无渲染。单点挂载于 App，监听 config.audio.ambient 驱动播放引擎。
// 处理浏览器自动播放策略——被拦截时挂一次性用户手势监听，手势触发后重试。
import {watch, onMounted, onBeforeUnmount} from 'vue';
import {useConfigStore} from '../../stores/useConfigStore';
import {getAmbientSound} from '../../features/audio/ambientSounds';
import {playAmbient, stopAmbient, setAmbientVolume, ambientBlocked} from '../../features/audio/ambientEngine';

const store = useConfigStore();

let gestureBound = false;

function unbindGesture() {
    if (!gestureBound) return;
    window.removeEventListener('pointerdown', onGesture);
    window.removeEventListener('keydown', onGesture);
    gestureBound = false;
}

function bindGesture() {
    if (gestureBound) return;
    window.addEventListener('pointerdown', onGesture, {once: false});
    window.addEventListener('keydown', onGesture, {once: false});
    gestureBound = true;
}

async function onGesture() {
    const a = store.config.audio?.ambient;
    if (!a?.enabled) {
        unbindGesture();
        return;
    }
    const ok = await apply();
    if (ok) unbindGesture();
}

/** 按当前 config 状态驱动引擎，返回是否成功开始播放 */
async function apply(): Promise<boolean> {
    const a = store.config.audio?.ambient;
    if (!a || !a.enabled) {
        stopAmbient();
        return true;
    }
    const sound = getAmbientSound(a.currentId);
    if (!sound) {
        stopAmbient();
        return true;
    }
    const started = await playAmbient(sound, a.volume);
    if (!started && ambientBlocked.value) bindGesture();
    return started;
}

onMounted(() => {
    watch(
        () => {
            const a = store.config.audio?.ambient;
            return [store.isLoaded, a?.enabled, a?.currentId] as const;
        },
        () => {
            if (!store.isLoaded) return;
            void apply();
        },
        {immediate: true},
    );

    watch(
        () => store.config.audio?.ambient?.volume,
        (v) => {
            if (typeof v === 'number') setAmbientVolume(v);
        },
    );
});

onBeforeUnmount(() => {
    unbindGesture();
    stopAmbient();
});
</script>

<template>
    <span aria-hidden="true" style="display: none"></span>
</template>
