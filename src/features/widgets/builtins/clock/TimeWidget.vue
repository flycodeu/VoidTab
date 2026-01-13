<script setup lang="ts">
import {computed} from 'vue';
import {useNow, useDateFormat, usePreferredDark} from '@vueuse/core';
import {useConfigStore} from '../../../../stores/useConfigStore.ts';

const store = useConfigStore();
const now = useNow();

const timeStr = useDateFormat(now, 'HH:mm');
const dateStr = useDateFormat(now, 'MM月DD日 dddd');

// system 模式解析（非常关键）
const prefersDark = usePreferredDark();
const resolvedMode = computed<'light' | 'dark'>(() => {
  const m = store.config.theme.mode;
  if (m === 'system') return prefersDark.value ? 'dark' : 'light';
  return m;
});

// 颜色/阴影：不依赖 CSS 变量是否切换成功
const palette = computed(() => {
  return resolvedMode.value === 'dark'
      ? {
        primary: 'rgba(255,255,255,0.94)',
        secondary: 'rgba(255,255,255,0.70)',
        shadow: '0 16px 38px rgba(0,0,0,0.55)',
      }
      : {
        primary: 'rgba(17,24,39,0.92)',
        secondary: 'rgba(17,24,39,0.60)',
        shadow: '0 12px 28px rgba(0,0,0,0.14)',
      };
});

// 字体：techFont 时直接指定 monospace（避免你项目里 class 不存在）
const fontFamily = computed(() => {
  return store.config.theme.techFont
      ? `'JetBrains Mono','Inter',system-ui,-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif`
      : `'Inter',system-ui,-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif`;
});

const wrapStyle = computed(() => ({
  color: palette.value.primary,
}));

const timeStyle = computed(() => ({
  color: palette.value.primary,
  textShadow: palette.value.shadow,
  fontFamily: fontFamily.value,
  fontFeatureSettings: '"tnum"',
}));

const dateStyle = computed(() => ({
  color: palette.value.secondary,
  fontFamily: fontFamily.value,
}));
</script>

<template>
  <div
      v-if="store.config.theme.showTime"
      class="clock-wrap text-center select-none mb-3 z-30 transition-all"
      :style="wrapStyle"
  >
    <!-- 缩小字号（比你之前 7xl/8xl 克制很多） -->
    <h1 class="clock-time font-bold tracking-tight" :style="timeStyle">
      {{ timeStr }}
    </h1>

    <p class="clock-date font-medium uppercase tracking-widest mt-1" :style="dateStyle">
      {{ dateStr }}
    </p>
  </div>
</template>

<style scoped>
/* 进一步控制大小：Edge 风格更克制 */
.clock-time {
  font-size: clamp(36px, 4.2vw, 58px);
  line-height: 1.05;
}

/* 日期更小、更淡一些 */
.clock-date {
  font-size: clamp(12px, 1.3vw, 14px);
  letter-spacing: 0.18em;
}
</style>
