<script setup lang="ts">
import {computed, ref} from 'vue';
import {useElementSize} from '@vueuse/core';
import type {MusicEmbedWidgetState, SiteItem} from '../../../../core/config/types';
import {useConfigStore} from '../../../../stores/useConfigStore';
import {useMusicPlayer} from '../../../../stores/useMusicPlayer';
import {useTileSizeContext} from '../../../../core/tiles/context.ts';
import {DEFAULT_MUSIC_EMBED, MUSIC_PRESETS, getMusicProvider, isBlockedMusicSource} from './providers';
import MusicEmbedModal from './MusicEmbedModal.vue';
import {
  PhGearSix,
  PhListBullets,
  PhMusicNotes,
  PhPause,
  PhPlay,
  PhShuffle,
  PhSkipBack,
  PhSkipForward,
  PhVinylRecord,
  PhWaveform,
  PhX,
} from '@phosphor-icons/vue';

const props = defineProps<{ item: SiteItem; isEditMode: boolean }>();
const store = useConfigStore();
const player = useMusicPlayer();
const tileSize = useTileSizeContext(() => ({w: Number(props.item.w || 1), h: Number(props.item.h || 1)}));

const widgetId = computed(() => String(props.item.id));
const showModal = ref(false);
const showQueue = ref(false);

// 真实渲染尺寸：网格在窄屏会把宽组件裁到更少的列（MainGrid `Math.min(w, gridCols)`），
// 因此版式必须按实际像素判断，否则 4×2 被裁窄后仍套用 banner 样式会挤成一条。
const rootEl = ref<HTMLElement | null>(null);
const {width: elWidth, height: elHeight} = useElementSize(rootEl);

if (!store.config.runtime) (store.config as any).runtime = {};
if (!store.config.runtime.musicEmbed) store.config.runtime.musicEmbed = {widgets: {}};
if (!store.config.runtime.musicEmbed.widgets) store.config.runtime.musicEmbed.widgets = {};

const state = computed(() => store.config.runtime.musicEmbed.widgets[widgetId.value]);
const effectiveState = computed(() => {
  if (!state.value || isBlockedMusicSource(state.value)) return DEFAULT_MUSIC_EMBED;
  return state.value;
});
const provider = computed(() => getMusicProvider(effectiveState.value.provider));
const providerLabel = computed(() => provider.value?.label || '音乐');
const title = computed(() => effectiveState.value.title || providerLabel.value);
const isDefault = computed(() => !state.value || isBlockedMusicSource(state.value));
const isActive = computed(() => player.isActiveSource(effectiveState.value));

const w = computed(() => tileSize.value.placement.w);
const h = computed(() => tileSize.value.placement.h);

// 桌面提供的尺寸：1×1 / 2×1 / 1×2 / 2×2 / 4×2。
// 用实际像素判断版式（尺寸未测量前用网格单元估算），每个尺寸只展示与版面相称的信息。
// 列宽约 110px、行高约 103px、间距 20px → 4 列≈500px，2 行≈226px。
const aw = computed(() => elWidth.value || w.value * 120);
const ah = computed(() => elHeight.value || h.value * 103);
const layoutKind = computed(() => {
  const W = aw.value;
  const H = ah.value;
  const narrow = W < 175;   // ≈ 1 列
  const short = H < 165;    // ≈ 1 行
  if (narrow && short) return 'micro';  // 1×1 —— 纯封面
  if (narrow) return 'tall';            // 1×2 —— 竖向封面
  if (short) return 'wide';             // 2×1 —— 横向条
  if (H >= 330) return 'poster';        // 拖拽出的超高卡
  if (W >= 430) return 'banner';        // 4×2 —— 封面 + 列表
  return 'panel';                       // 2×2 —— 方形卡
});

// 小尺寸（1×1 / 1×2 / 2×1）只展示封面图标，不显示标题/列表/控制。
const iconOnly = computed(() => ['micro', 'tall', 'wide'].includes(layoutKind.value));
const showCopy = computed(() => !iconOnly.value);
const hasTransport = computed(() => layoutKind.value === 'banner');
const showBottom = computed(() => ['panel', 'poster'].includes(layoutKind.value));
const fullTransport = computed(() => layoutKind.value === 'banner');

const recordIconSize = computed(() => {
  switch (layoutKind.value) {
    case 'micro':
      return 24;
    case 'tall':
      return 42;
    case 'wide':
      return 32;
    case 'poster':
      return 48;
    default:
      return 34;
  }
});

const queueSources = computed<{ id: string; label: string; group: string; state: MusicEmbedWidgetState }[]>(() => {
  const items = [
    {id: 'current', label: title.value, group: isDefault.value ? '默认' : '当前组件', state: effectiveState.value},
    ...MUSIC_PRESETS.map((p) => ({id: p.id, label: p.label, group: p.group, state: p.state})),
  ];
  const seen = new Set<string>();
  return items.filter((item) => {
    if (isBlockedMusicSource(item.state)) return false;
    const key = `${item.state.provider}:${item.state.resourceId}:${item.state.customUrl || ''}:${item.state.title || item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});

const previewCount = computed(() => {
  switch (layoutKind.value) {
    case 'banner':
      return 6;
    case 'poster':
      return 8;
    case 'panel':
      return 3;
    default:
      return 0;
  }
});
const previewItems = computed(() => queueSources.value.slice(0, previewCount.value));

function openQueue() {
  if (props.isEditMode) return;
  showQueue.value = true;
}

function playSource(source: MusicEmbedWidgetState) {
  if (props.isEditMode) return;
  player.play(source);
}

function togglePrimary() {
  if (props.isEditMode) return;
  if (isActive.value) player.close();
  else player.play(effectiveState.value);
}

function currentIndex() {
  return queueSources.value.findIndex((item) => player.isActiveSource(item.state));
}

function playNext() {
  if (props.isEditMode) return;
  const list = queueSources.value;
  if (!list.length) return;
  const index = currentIndex();
  const next = list[index < 0 ? 0 : (index + 1) % list.length];
  player.play(next.state);
}

function playPrev() {
  if (props.isEditMode) return;
  const list = queueSources.value;
  if (!list.length) return;
  const index = currentIndex();
  const prev = list[index <= 0 ? list.length - 1 : index - 1];
  player.play(prev.state);
}

function playShuffle() {
  if (props.isEditMode) return;
  const list = queueSources.value;
  if (!list.length) return;
  const index = currentIndex();
  let target = index;
  if (list.length > 1) while (target === index) target = Math.floor(Math.random() * list.length);
  else target = 0;
  player.play(list[target].state);
}

function openSettings() {
  if (props.isEditMode) return;
  showQueue.value = false;  // 避免与播放列表弹窗叠加
  showModal.value = true;
}
</script>

<template>
  <div
      ref="rootEl"
      class="music-widget"
      :class="[`layout-${layoutKind}`, isEditMode ? 'is-edit' : '', isActive ? 'is-active' : '']"
      role="button"
      tabindex="0"
      :aria-label="`打开音乐列表：${title}`"
      @click="openQueue"
      @keydown.enter.prevent="openQueue"
      @keydown.space.prevent="openQueue"
  >
    <div class="aurora"></div>
    <div class="noise"></div>

    <div v-if="!iconOnly" class="widget-top">
      <div class="brand">
        <PhMusicNotes size="13" weight="bold"/>
        <span>Void FM</span>
      </div>
      <button v-if="!isEditMode" class="icon-action" title="配置音乐源" @click.stop="openSettings">
        <PhGearSix size="14" weight="bold"/>
      </button>
    </div>

    <div class="body">
      <div class="main-col">
        <div class="hero">
          <button class="record" :class="{ spinning: isActive }" :title="isActive ? '停止播放' : '播放当前歌曲'" @click.stop="togglePrimary">
            <PhVinylRecord class="record-icon" :size="recordIconSize" weight="fill"/>
            <span class="record-core">
              <PhPause v-if="isActive" size="13" weight="fill"/>
              <PhPlay v-else size="13" weight="fill"/>
            </span>
          </button>

          <div v-if="showCopy" class="track-copy">
            <div class="eyebrow">
              <PhWaveform size="12" weight="bold"/>
              {{ providerLabel }}<span v-if="isDefault"> · 默认</span>
            </div>
            <div class="track-title">{{ title }}</div>
            <div class="track-status">{{ isActive ? '正在播放' : '点击查看列表播放' }}</div>
          </div>
        </div>

        <div v-if="hasTransport" class="transport">
          <button class="primary-action" :title="isActive ? '停止' : '播放'" @click.stop="togglePrimary">
            <PhPause v-if="isActive" size="15" weight="fill"/>
            <PhPlay v-else size="15" weight="fill"/>
            <span v-if="layoutKind !== 'tall'">{{ isActive ? '停止' : '播放' }}</span>
          </button>
          <button v-if="fullTransport" class="ghost-action" title="上一首" @click.stop="playPrev">
            <PhSkipBack size="15" weight="fill"/>
          </button>
          <button class="ghost-action" title="下一首" @click.stop="playNext">
            <PhSkipForward size="15" weight="fill"/>
          </button>
          <button v-if="fullTransport" class="ghost-action" title="随机播放" @click.stop="playShuffle">
            <PhShuffle size="15" weight="bold"/>
          </button>
          <button class="ghost-action" title="列表" @click.stop="openQueue">
            <PhListBullets size="15" weight="bold"/>
          </button>
        </div>
      </div>

      <div v-if="previewItems.length" class="side-col">
        <div class="queue-preview">
          <button
              v-for="item in previewItems"
              :key="item.id"
              class="preview-row"
              :class="{ selected: player.isActiveSource(item.state) }"
              @click.stop="playSource(item.state)"
          >
            <span class="preview-dot"></span>
            <span class="preview-title">{{ item.label }}</span>
            <span class="preview-group">{{ item.group }}</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="showBottom" class="bottom-strip">
      <span>{{ queueSources.length }} 首</span>
      <button class="list-action" @click.stop="openQueue">
        <PhListBullets size="14" weight="bold"/>
        <span>列表</span>
      </button>
    </div>

    <button v-if="!isEditMode && iconOnly" class="micro-gear" title="配置音乐源" @click.stop="openSettings">
      <PhGearSix size="12" weight="bold"/>
    </button>

    <Teleport to="body">
      <MusicEmbedModal :show="showModal" :widget-id="widgetId" @close="showModal = false"/>

      <Transition name="queue-pop">
        <div v-if="showQueue" class="queue-mask" @click="showQueue = false">
          <section class="queue-sheet" role="dialog" aria-modal="true" aria-label="音乐列表" @click.stop>
            <header class="queue-head">
              <div>
                <div class="queue-kicker">播放列表</div>
                <h3>Void FM</h3>
              </div>
              <div class="queue-head-actions">
                <button class="queue-small" title="配置音乐源" @click="openSettings">
                  <PhGearSix size="16" weight="bold"/>
                </button>
                <button class="queue-small" title="关闭" @click="showQueue = false">
                  <PhX size="16" weight="bold"/>
                </button>
              </div>
            </header>

            <div class="queue-current">
              <button class="record large" :class="{ spinning: isActive }" @click="togglePrimary">
                <PhVinylRecord size="36" weight="fill"/>
                <span class="record-core">
                  <PhPause v-if="isActive" size="14" weight="fill"/>
                  <PhPlay v-else size="14" weight="fill"/>
                </span>
              </button>
              <div class="min-w-0 flex-1">
                <div class="queue-now">{{ title }}</div>
                <div class="queue-sub">{{ providerLabel }} · {{ isActive ? '正在播放' : '待播放' }}</div>
              </div>
            </div>

            <div class="queue-transport">
              <button class="t-ghost" title="上一首" @click="playPrev">
                <PhSkipBack size="16" weight="fill"/>
              </button>
              <button class="t-main" :title="isActive ? '停止' : '播放'" @click="togglePrimary">
                <PhPause v-if="isActive" size="18" weight="fill"/>
                <PhPlay v-else size="18" weight="fill"/>
              </button>
              <button class="t-ghost" title="下一首" @click="playNext">
                <PhSkipForward size="16" weight="fill"/>
              </button>
              <button class="t-ghost" title="随机播放" @click="playShuffle">
                <PhShuffle size="16" weight="bold"/>
              </button>
            </div>

            <div class="queue-list">
              <button
                  v-for="(item, index) in queueSources"
                  :key="item.id"
                  class="queue-item"
                  :class="{ selected: player.isActiveSource(item.state) }"
                  @click="playSource(item.state)"
              >
                <span class="queue-index">{{ String(index + 1).padStart(2, '0') }}</span>
                <span class="queue-name">{{ item.label }}</span>
                <span class="queue-tag">{{ item.group }}</span>
                <PhPlay size="14" weight="fill"/>
              </button>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.music-widget {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #fff;
  /* 跟随系统主题色：背景由强调色派生的深色渐变 + 强调色光晕 */
  background: radial-gradient(circle at 18% 14%, rgba(var(--accent-color-rgb), 0.55), transparent 55%),
  radial-gradient(circle at 88% 86%, rgba(var(--accent-color-rgb), 0.30), transparent 60%),
  linear-gradient(150deg,
  color-mix(in srgb, var(--accent-color) 42%, #0c0e13),
  color-mix(in srgb, var(--accent-color) 18%, #0a0b0e) 60%,
  #0a0b0e);
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.30);
  cursor: pointer;
  isolation: isolate;
  transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
}

.music-widget:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.22);
}

.music-widget.is-active {
  border-color: rgba(var(--accent-color-rgb), 0.62);
  box-shadow: 0 0 0 1px rgba(var(--accent-color-rgb), 0.16), 0 18px 38px rgba(0, 0, 0, 0.34);
}

.aurora,
.noise {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.aurora {
  background: conic-gradient(from 130deg at 30% 20%, transparent, rgba(var(--accent-color-rgb), 0.28), transparent 30%),
  linear-gradient(115deg, rgba(255, 255, 255, .08), transparent 45%);
  mix-blend-mode: screen;
}

.noise {
  opacity: .12;
  background-image: radial-gradient(rgba(255, 255, 255, .7) 0.6px, transparent 0.6px);
  background-size: 9px 9px;
}

.widget-top,
.body,
.bottom-strip {
  position: relative;
  z-index: 1;
}

.widget-top {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 10px 0;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
  opacity: .78;
}

.icon-action,
.micro-gear,
.queue-small {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, .10);
  color: inherit;
  transition: background .16s ease, transform .16s ease;
}

.icon-action {
  width: 26px;
  height: 26px;
}

.icon-action:hover,
.micro-gear:hover,
.queue-small:hover {
  background: rgba(255, 255, 255, .18);
  transform: translateY(-1px);
}

/* body = 主列 + 可选侧列；默认竖排，banner 横排 */
.body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.main-col {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.side-col {
  min-height: 0;
}

.hero {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
}

.record {
  position: relative;
  width: 58px;
  height: 58px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
  color: #fff;
  background: radial-gradient(circle, rgba(255, 255, 255, .20) 0 9%, transparent 10%),
  linear-gradient(135deg, var(--accent-color), color-mix(in srgb, var(--accent-color) 55%, #0b0b10) 60%, #111827);
  box-shadow: 0 14px 26px rgba(var(--accent-color-rgb), .34);
}

.record.large {
  width: 62px;
  height: 62px;
}

.record.spinning .record-icon,
.record.spinning > svg {
  animation: widget-spin 5s linear infinite;
}

.record-core {
  position: absolute;
  right: 7px;
  bottom: 7px;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, .64);
  box-shadow: 0 6px 12px rgba(0, 0, 0, .26);
}

.track-copy {
  min-width: 0;
  flex: 1;
}

.eyebrow,
.track-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 800;
  opacity: .68;
}

.track-title {
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 1.12;
  font-weight: 950;
}

.track-status {
  margin-top: 4px;
}

.transport {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px 10px;
}

.list-action,
.primary-action,
.ghost-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-radius: 999px;
  font-weight: 900;
  background: rgba(255, 255, 255, .12);
  color: inherit;
}

.primary-action {
  height: 30px;
  padding: 0 12px;
  background: rgba(255, 255, 255, .18);
}

.ghost-action {
  width: 30px;
  height: 30px;
  flex: none;
}

.bottom-strip {
  flex: 0 0 auto;
  margin: auto 10px 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  font-weight: 850;
  opacity: .82;
}

.list-action {
  height: 24px;
  padding: 0 8px;
}

.queue-preview {
  min-height: 0;
  display: grid;
  gap: 6px;
}

.preview-row {
  min-width: 0;
  height: 30px;
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, .08);
  transition: background .14s ease;
}

.preview-row:hover {
  background: rgba(255, 255, 255, .14);
}

.preview-row.selected {
  background: rgba(var(--accent-color-rgb), .26);
}

.preview-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  opacity: .48;
}

.preview-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 850;
}

.preview-group {
  font-size: 9px;
  opacity: .55;
}

/* ===== 1×1 micro：纯封面 ===== */
.layout-micro .body {
  padding: 0;
}

.layout-micro .main-col {
  justify-content: center;
}

.layout-micro .hero {
  justify-content: center;
  padding: 0;
}

.layout-micro .record {
  width: clamp(34px, 56%, 50px);
  height: clamp(34px, 56%, 50px);
  border-radius: 17px;
}

.micro-gear {
  position: absolute;
  right: 6px;
  top: 6px;
  z-index: 2;
  width: 22px;
  height: 22px;
}

/* ===== 1×2 tall：竖向纯封面（只露图标） ===== */
.layout-tall .main-col {
  justify-content: center;
}

.layout-tall .hero {
  justify-content: center;
  padding: 0;
}

.layout-tall .record {
  width: 70px;
  height: 70px;
  border-radius: 22px;
}

/* ===== 2×1 wide：横向纯封面（只露图标） ===== */
.layout-wide .main-col {
  justify-content: center;
}

.layout-wide .hero {
  justify-content: center;
  padding: 0;
}

.layout-wide .record {
  width: 58px;
  height: 58px;
  border-radius: 18px;
}

/* ===== 2×2 panel：方形卡 ===== */
.layout-panel .hero {
  flex: 0 0 auto;
  padding: 8px 10px 6px;
}

.layout-panel .main-col {
  flex: 0 0 auto;
  justify-content: flex-start;
}

.layout-panel .record {
  width: 56px;
  height: 56px;
  border-radius: 20px;
}

.layout-panel .track-title {
  font-size: 15px;
}

.layout-panel .track-status {
  display: none;
}

.layout-panel .side-col {
  flex: 1 1 auto;
  overflow: hidden;
  margin: 0 10px 4px;
}

.layout-panel .preview-row {
  height: 26px;
}

/* ===== 4×2 banner：左封面 + 右列表 ===== */
.layout-banner .body {
  flex-direction: row;
  gap: 6px;
  padding: 2px 4px 6px;
}

.layout-banner .main-col {
  flex: 1 1 44%;
  min-width: 0;
}

.layout-banner .hero {
  padding: 8px 8px 4px;
}

.layout-banner .record {
  width: 60px;
  height: 60px;
}

.layout-banner .track-title {
  font-size: 16px;
}

.layout-banner .transport {
  padding: 0 8px 4px;
}

.layout-banner .side-col {
  flex: 1 1 56%;
  min-width: 0;
  align-self: center;
  padding-right: 6px;
}

.layout-banner .queue-preview {
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}

.layout-banner .preview-row {
  height: 28px;
}

.layout-banner .preview-group {
  display: none;
}

/* ===== 超高 poster（自由拖拽） ===== */
.layout-poster .hero {
  flex-direction: column;
  align-items: flex-start;
  padding-top: 14px;
}

.layout-poster .main-col {
  flex: 0 0 auto;
  justify-content: flex-start;
}

.layout-poster .record {
  width: 82px;
  height: 82px;
  border-radius: 28px;
}

.layout-poster .track-title {
  font-size: 19px;
  white-space: normal;
}

.layout-poster .side-col {
  flex: 1 1 auto;
  overflow: hidden;
  margin: 0 10px;
}

/* ===== 播放列表面板 ===== */
.queue-mask {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(0, 0, 0, .58);
  backdrop-filter: blur(14px);
}

.queue-sheet {
  width: min(440px, calc(100vw - 28px));
  max-height: min(680px, calc(100vh - 40px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 26px;
  border: 1px solid rgba(255, 255, 255, .14);
  color: #fff;
  /* 与卡片同款：强调色派生的深色渐变，使弹窗与组件主题一致 */
  background: radial-gradient(circle at 14% 10%, rgba(var(--accent-color-rgb), .45), transparent 55%),
  radial-gradient(circle at 90% 92%, rgba(var(--accent-color-rgb), .22), transparent 60%),
  linear-gradient(150deg,
  color-mix(in srgb, var(--accent-color) 38%, #0c0e13),
  color-mix(in srgb, var(--accent-color) 16%, #0a0b0e) 60%,
  #0a0b0e);
  box-shadow: 0 24px 72px rgba(0, 0, 0, .52);
}

.queue-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 18px 12px;
}

.queue-kicker {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .12em;
  opacity: .52;
}

.queue-head h3 {
  margin: 2px 0 0;
  font-size: 20px;
  font-weight: 950;
}

.queue-head-actions {
  display: flex;
  gap: 8px;
}

.queue-small {
  width: 34px;
  height: 34px;
}

.queue-current {
  margin: 0 18px 12px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 20px;
  background: rgba(var(--accent-color-rgb), .14);
  border: 1px solid rgba(var(--accent-color-rgb), .20);
}

.queue-now {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 950;
}

.queue-sub {
  margin-top: 3px;
  font-size: 11px;
  font-weight: 800;
  opacity: .62;
}

.queue-transport {
  margin: 0 18px 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.t-ghost,
.t-main {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: inherit;
  background: rgba(255, 255, 255, .10);
  transition: background .16s ease, transform .16s ease;
}

.t-ghost {
  width: 38px;
  height: 38px;
}

.t-main {
  width: 52px;
  height: 52px;
  background: linear-gradient(135deg, var(--accent-color), color-mix(in srgb, var(--accent-color) 55%, #0b0b10));
  box-shadow: 0 10px 22px rgba(var(--accent-color-rgb), .38);
}

.t-ghost:hover,
.t-main:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, .18);
}

.t-main:hover {
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent-color) 85%, #fff), var(--accent-color));
}

.queue-list {
  padding: 0 10px 12px;
  overflow-y: auto;
}

.queue-item {
  width: 100%;
  min-width: 0;
  height: 42px;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto 24px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-radius: 14px;
  color: inherit;
}

.queue-item:hover {
  background: rgba(255, 255, 255, .10);
}

.queue-item.selected {
  background: rgba(var(--accent-color-rgb), .20);
  color: color-mix(in srgb, var(--accent-color) 72%, #fff);
}

.queue-index {
  font-size: 10px;
  font-weight: 900;
  opacity: .46;
}

.queue-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  font-size: 12px;
  font-weight: 850;
}

.queue-tag {
  font-size: 10px;
  font-weight: 800;
  opacity: .52;
}

.queue-pop-enter-active,
.queue-pop-leave-active {
  transition: opacity .18s ease;
}

.queue-pop-enter-active .queue-sheet,
.queue-pop-leave-active .queue-sheet {
  transition: transform .18s var(--ease-spring), opacity .18s ease;
}

.queue-pop-enter-from,
.queue-pop-leave-to {
  opacity: 0;
}

.queue-pop-enter-from .queue-sheet,
.queue-pop-leave-to .queue-sheet {
  transform: translateY(12px) scale(.98);
  opacity: 0;
}

@keyframes widget-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
