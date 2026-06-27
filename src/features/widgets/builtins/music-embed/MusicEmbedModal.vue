<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {useConfigStore} from '../../../../stores/useConfigStore';
import type {MusicEmbedProviderId, MusicEmbedWidgetState} from '../../../../core/config/types';
import {
  MUSIC_PROVIDERS,
  getMusicProvider,
  buildMusicEmbedUrl,
  buildNativeAudioUrl,
  isNativeAudioSource,
  DEFAULT_MUSIC_EMBED,
  MUSIC_PRESETS,
  type MusicPreset,
} from './providers';
import {useEscapeClose} from '../../../../shared/composables/useEscapeClose';
import {useMusicPlayer} from '../../../../stores/useMusicPlayer';
import {cleanupMusicEmbedWidgetState} from './cleanup';
import {PhX, PhMusicNotes, PhCheck, PhTrash, PhPlay} from '@phosphor-icons/vue';

const props = defineProps<{ show: boolean; widgetId: string }>();
const emit = defineEmits(['close']);
useEscapeClose(() => props.show, () => emit('close'));

const store = useConfigStore();
const player = useMusicPlayer();

// Runtime config safety
if (!store.config.runtime) (store.config as any).runtime = {};
if (!store.config.runtime.musicEmbed) store.config.runtime.musicEmbed = {widgets: {}};
if (!store.config.runtime.musicEmbed.widgets) store.config.runtime.musicEmbed.widgets = {};

const widgets = computed(() => store.config.runtime.musicEmbed.widgets);

// 表单本地状态
const providerId = ref<MusicEmbedProviderId>('audio');
const linkInput = ref('');
const titleInput = ref('');
const autoplay = ref(false);
const height = ref(90);
const error = ref('');

const currentProvider = computed(() => getMusicProvider(providerId.value));

function loadFromState() {
  const s = widgets.value[props.widgetId];
  if (s) {
    providerId.value = s.provider;
    autoplay.value = !!s.autoplay;
    height.value = s.height || 90;
    linkInput.value = s.customUrl || s.resourceId || '';
    titleInput.value = s.title || '';
  } else {
    // 未配置：用默认原生音频预填，避免默认加载第三方 iframe。
    providerId.value = DEFAULT_MUSIC_EMBED.provider;
    autoplay.value = !!DEFAULT_MUSIC_EMBED.autoplay;
    height.value = DEFAULT_MUSIC_EMBED.height || 90;
    linkInput.value = DEFAULT_MUSIC_EMBED.resourceId;
    titleInput.value = DEFAULT_MUSIC_EMBED.title || '';
  }
  error.value = '';
}

watch(() => props.show, (v) => {
  if (v) loadFromState();
});

// 实时预览：从当前表单解析出临时 state
const previewState = computed<MusicEmbedWidgetState | null>(() => {
  const provider = currentProvider.value;
  if (!provider || !linkInput.value.trim()) return null;
  const parsed = provider.parse(linkInput.value);
  if (!parsed) return null;
  return {
    provider: parsed.provider,
    kind: parsed.kind,
    resourceId: parsed.resourceId,
    customUrl: parsed.provider === 'custom' || parsed.provider === 'audio' ? parsed.resourceId : undefined,
    autoplay: autoplay.value,
    height: height.value,
    title: titleInput.value.trim() || undefined,
  };
});

const previewUrl = computed(() => buildMusicEmbedUrl(previewState.value || undefined));
const isAudioPreview = computed(() => isNativeAudioSource(previewState.value));
const nativePreviewUrl = computed(() => buildNativeAudioUrl(previewState.value));
const canPreview = computed(() => isAudioPreview.value ? !!nativePreviewUrl.value : !!previewUrl.value);

function buildState(): MusicEmbedWidgetState | null {
  const provider = currentProvider.value;
  if (!provider) return null;
  const parsed = provider.parse(linkInput.value);
  if (!parsed) return null;
  return {
    provider: parsed.provider,
    kind: parsed.kind,
    resourceId: parsed.resourceId,
    customUrl: parsed.provider === 'custom' || parsed.provider === 'audio' ? parsed.resourceId : undefined,
    autoplay: autoplay.value,
    height: height.value,
    title: titleInput.value.trim() || undefined,
  };
}

// 保存配置；play=true 时顺手送进全局播放器（即时联调）
function apply(play = false) {
  const next = buildState();
  if (!next) {
    error.value = '无法识别该链接，请检查格式或更换服务类型。';
    return;
  }
  widgets.value[props.widgetId] = next;
  error.value = '';
  store.saveConfig?.();
  if (play) player.play(next);
  emit('close');
}

function clear() {
  cleanupMusicEmbedWidgetState(store.config, props.widgetId);
  store.saveConfig?.();
  emit('close');
}

// 选预设：把表单填成该预设，方便用户改名或直接保存/播放
function applyPreset(p: MusicPreset) {
  providerId.value = p.state.provider;
  autoplay.value = !!p.state.autoplay;
  height.value = p.state.height || 90;
  linkInput.value = p.state.customUrl || p.state.resourceId || '';
  titleInput.value = p.state.title || '';
  error.value = '';
}
</script>

<template>
  <Transition name="fade-scale">
    <div v-if="show" class="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')"></div>

      <div
          class="music-modal relative w-full max-w-lg max-h-[88vh] flex flex-col rounded-xl shadow-2xl overflow-hidden text-white"
      >
        <div class="h-14 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
          <div class="text-sm font-bold flex items-center gap-2">
            <PhMusicNotes size="18" weight="fill" class="text-[var(--accent-color)]"/>
            音乐源配置
          </div>
          <button
              class="p-1.5 rounded-md hover:bg-white/10 transition-colors text-white/60"
              @click="emit('close')"
          >
            <PhX size="16"/>
          </button>
        </div>

        <div class="p-4 flex flex-col gap-4 overflow-y-auto">
          <!-- 服务选择 -->
          <div class="flex flex-col gap-2">
            <label class="text-[10px] font-bold text-white/55 uppercase tracking-wider">音乐服务</label>
            <div class="grid grid-cols-4 gap-2">
              <button
                  v-for="p in MUSIC_PROVIDERS"
                  :key="p.id"
                  type="button"
                  @click="providerId = p.id; error = ''"
                  class="px-2 py-2 rounded-lg text-xs font-bold border transition-all"
                  :class="providerId === p.id
                    ? 'border-[var(--accent-color)] text-[var(--accent-color)] bg-[var(--accent-color)]/10'
                    : 'border-white/12 opacity-70 hover:opacity-100'"
              >
                {{ p.label }}
              </button>
            </div>
          </div>

          <!-- 内置歌曲快速选择 -->
          <div class="flex flex-col gap-2">
            <label class="text-[10px] font-bold text-white/55 uppercase tracking-wider">内置歌曲</label>
            <div class="max-h-28 overflow-y-auto flex flex-wrap gap-1.5 pr-1 custom-scroll">
              <button
                  v-for="p in MUSIC_PRESETS"
                  :key="p.id"
                  type="button"
                  class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-white/12 opacity-80 hover:opacity-100 hover:border-[var(--accent-color)] transition-all"
                  @click="applyPreset(p)"
              >
                {{ p.group }}·{{ p.label }}
              </button>
            </div>
          </div>

          <!-- 链接输入 -->
          <div class="flex flex-col gap-2">
            <label class="text-[10px] font-bold text-white/55 uppercase tracking-wider">分享链接 / ID</label>
            <input
                v-model="linkInput"
                type="text"
                :placeholder="currentProvider?.placeholder"
                class="w-full px-3 py-2 rounded-lg bg-white/[0.06] border border-white/12 text-xs outline-none focus:border-[var(--accent-color)] transition-all"
            />
            <p v-if="error" class="text-[10px] text-red-500 font-medium">{{ error }}</p>
            <p v-if="providerId === 'netease'" class="text-[10px] text-amber-500 font-medium leading-relaxed">
              提示：网易云外链播放器的跨域报错来自其 iframe 内部脚本，宿主页面无法修复；且未登录/版权受限时常无法播放。需要稳定播放时请使用「音频直链」或内置歌曲。
            </p>
          </div>

          <!-- 卡片标题 -->
          <div class="flex flex-col gap-2">
            <label class="text-[10px] font-bold text-white/55 uppercase tracking-wider">卡片标题</label>
            <input
                v-model="titleInput"
                type="text"
                placeholder="自定义显示名称（如：通勤歌单）"
                class="w-full px-3 py-2 rounded-lg bg-white/[0.06] border border-white/12 text-xs outline-none focus:border-[var(--accent-color)] transition-all"
            />
            <p class="text-[10px] text-white/55 leading-relaxed">
              第三方嵌入无法读取播放器内“正在播放”的歌名；音频直链会使用此标题作为播放条名称。
            </p>
          </div>

          <!-- 选项 -->
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold">自动播放</span>
            <input type="checkbox" v-model="autoplay" class="w-5 h-5 accent-[var(--accent-color)]"/>
          </div>

          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold">高度</span>
              <span class="text-[10px] font-bold opacity-70">{{ height }}px</span>
            </div>
            <input type="range" min="66" max="450" step="2" v-model.number="height" class="w-full accent-[var(--accent-color)]"/>
          </div>

          <!-- 预览 -->
          <div class="flex flex-col gap-2">
            <label class="text-[10px] font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5">
              <PhPlay weight="fill"/> 预览
            </label>
            <div class="rounded-lg overflow-hidden border border-white/12 bg-white/[0.06]">
              <audio
                  v-if="isAudioPreview && nativePreviewUrl"
                  :src="nativePreviewUrl"
                  class="w-full block p-3"
                  controls
                  preload="metadata"
              ></audio>
              <iframe
                  v-else-if="previewUrl"
                  :src="previewUrl"
                  class="w-full block"
                  :style="{ height: height + 'px' }"
                  frameborder="0"
                  allow="autoplay; encrypted-media"
                  referrerpolicy="no-referrer"
              ></iframe>
              <div v-else class="py-8 text-center text-xs text-white/55">
                输入有效链接后显示预览
              </div>
            </div>
          </div>
        </div>

        <div class="mt-auto p-4 border-t border-white/10 flex gap-2">
          <button
              class="flex-1 py-2.5 rounded-lg text-xs font-bold bg-[var(--accent-color)] text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
              :disabled="!canPreview"
              @click="apply(true)"
          >
            <PhPlay size="14" weight="fill"/> 保存并播放
          </button>
          <button
              class="px-4 py-2.5 rounded-lg text-xs font-bold border border-white/12 flex items-center justify-center gap-1.5 disabled:opacity-50"
              :disabled="!canPreview"
              @click="apply(false)"
          >
            <PhCheck size="14" weight="bold"/> 保存
          </button>
          <button
              class="px-4 py-2.5 rounded-lg text-xs font-bold border border-white/12 text-red-500 hover:bg-red-500/10 flex items-center justify-center gap-1.5"
              @click="clear"
          >
            <PhTrash size="14" weight="bold"/> 清除
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 与卡片/播放列表弹窗统一的深色强调色面板 */
.music-modal {
  background: radial-gradient(circle at 14% 8%, rgba(var(--accent-color-rgb), .42), transparent 50%),
  radial-gradient(circle at 92% 96%, rgba(var(--accent-color-rgb), .20), transparent 60%),
  linear-gradient(150deg,
  color-mix(in srgb, var(--accent-color) 34%, #0c0e13),
  color-mix(in srgb, var(--accent-color) 14%, #0a0b0e) 60%,
  #0a0b0e);
  border: 1px solid rgba(var(--accent-color-rgb), .22);
}

.music-modal input::placeholder {
  color: rgba(255, 255, 255, .4);
}

.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
