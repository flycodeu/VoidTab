<script setup lang="ts">
// 全局隐藏音乐引擎。
// 不再渲染任何悬浮播放器 UI；音乐播放入口、列表和控制全部放在 MusicEmbedWidget 内。
// 这里仅负责让组件切换/页面变化后音频不中断。
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {useMusicPlayer} from '../../stores/useMusicPlayer';
import {
  buildMusicEmbedUrl,
  buildNativeAudioUrl,
  isNativeAudioSource,
} from '../../features/widgets/builtins/music-embed/providers';

const player = useMusicPlayer();
const audioRef = ref<HTMLAudioElement | null>(null);

const isNativeAudio = computed(() => isNativeAudioSource(player.source));
const audioUrl = computed(() => buildNativeAudioUrl(player.source));
const embedUrl = computed(() => isNativeAudio.value ? '' : buildMusicEmbedUrl(player.source || undefined));
const hasRenderableSource = computed(() => player.visible && (isNativeAudio.value ? !!audioUrl.value : !!embedUrl.value));

async function tryPlay() {
  const audio = audioRef.value;
  if (!audio) return;
  try {
    await audio.play();
  } catch {
    // 浏览器可能要求用户手势；组件内下一次点击播放会再次触发。
  }
}

function onEnded() {
  // 当前队列逻辑在组件内；隐藏引擎不主动改源，避免跨组件状态跳变。
}

watch(audioUrl, async () => {
  await nextTick();
  await tryPlay();
});

onMounted(async () => {
  await player.hydrate();
  await nextTick();
  await tryPlay();
});

onBeforeUnmount(() => {
  audioRef.value?.pause();
});
</script>

<template>
  <Teleport to="body">
    <div v-if="hasRenderableSource" class="music-engine" aria-hidden="true">
      <audio
          v-if="isNativeAudio"
          ref="audioRef"
          :src="audioUrl"
          preload="metadata"
          autoplay
          @ended="onEnded"
      ></audio>
      <iframe
          v-else
          :src="embedUrl"
          frameborder="0"
          allow="autoplay; encrypted-media; clipboard-write; picture-in-picture"
          referrerpolicy="no-referrer"
          tabindex="-1"
      ></iframe>
    </div>
  </Teleport>
</template>

<style scoped>
.music-engine {
  position: fixed;
  width: 0;
  height: 0;
  overflow: hidden;
  pointer-events: none;
  opacity: 0;
}

.music-engine audio,
.music-engine iframe {
  width: 0;
  height: 0;
  border: 0;
}
</style>
