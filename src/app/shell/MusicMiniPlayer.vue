<script setup lang="ts">
// 全局隐藏音乐引擎。
// 不再渲染任何悬浮播放器 UI；音乐播放入口、列表和控制全部放在 MusicEmbedWidget 内。
// 这里仅负责让组件切换/页面变化后音频不中断。
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {
  MUSIC_PLAYER_PLAY_REQUEST,
  type MusicPlayerPlayRequestDetail,
  useMusicPlayer,
} from '../../stores/useMusicPlayer';
import {
  buildMusicEmbedUrl,
  buildNativeAudioUrl,
  isNativeAudioSource,
} from '../../features/widgets/builtins/music-embed/providers';

const player = useMusicPlayer();
const audioRef = ref<HTMLAudioElement | null>(null);
const loadedAudioUrl = ref('');

const isNativeAudio = computed(() => isNativeAudioSource(player.source));
const audioUrl = computed(() => buildNativeAudioUrl(player.source));
const embedUrl = computed(() => isNativeAudio.value ? '' : buildMusicEmbedUrl(player.source || undefined));
const hasRenderableSource = computed(() => player.visible && (isNativeAudio.value ? !!audioUrl.value : !!embedUrl.value));
const activeAudioUrl = computed(() => player.visible && isNativeAudio.value ? audioUrl.value : '');

function setAudioSource(url: string) {
  const audio = audioRef.value;
  if (!audio || !url) return false;
  if (loadedAudioUrl.value !== url) {
    loadedAudioUrl.value = url;
    audio.src = url;
    audio.load();
  } else if (audio.ended) {
    audio.currentTime = 0;
  }
  return true;
}

async function tryPlay(url = activeAudioUrl.value, reportFailure = false) {
  const audio = audioRef.value;
  if (!audio || !url || !setAudioSource(url)) return;
  try {
    await audio.play();
    player.clearPlaybackError();
  } catch (error) {
    // 浏览器可能要求用户手势；组件内下一次点击播放会再次触发。
    if (reportFailure) {
      player.setPlaybackError(error instanceof Error && error.name === 'NotAllowedError'
          ? '浏览器拦截了自动播放，请再点一次播放。'
          : '音频暂时无法播放，请切换歌曲或检查链接。');
    }
  }
}

function onEnded() {
  // 当前队列逻辑在组件内；隐藏引擎不主动改源，避免跨组件状态跳变。
}

function onAudioError() {
  if (!player.visible || !activeAudioUrl.value) return;
  player.setPlaybackError('音频加载失败，请切换歌曲或检查直链是否可访问。');
}

function stopNativeAudio(clearSource = false) {
  const audio = audioRef.value;
  if (!audio) return;
  audio.pause();
  if (clearSource) {
    audio.removeAttribute('src');
    loadedAudioUrl.value = '';
    audio.load();
  }
}

function handlePlayRequest(event: Event) {
  const detail = (event as CustomEvent<MusicPlayerPlayRequestDetail>).detail;
  const source = detail?.source;
  if (!source) return;
  if (isNativeAudioSource(source)) {
    void tryPlay(buildNativeAudioUrl(source), true);
    return;
  }
  player.clearPlaybackError();
}

watch(activeAudioUrl, async (url) => {
  await nextTick();
  if (url) await tryPlay(url, false);
  else stopNativeAudio(true);
});

onMounted(async () => {
  window.addEventListener(MUSIC_PLAYER_PLAY_REQUEST, handlePlayRequest);
  await player.hydrate();
  await nextTick();
  await tryPlay(activeAudioUrl.value, false);
});

onBeforeUnmount(() => {
  window.removeEventListener(MUSIC_PLAYER_PLAY_REQUEST, handlePlayRequest);
  stopNativeAudio(true);
});
</script>

<template>
  <Teleport to="body">
    <div class="music-engine" aria-hidden="true">
      <audio
          ref="audioRef"
          preload="auto"
          @ended="onEnded"
          @error="onAudioError"
      ></audio>
      <iframe
          v-if="hasRenderableSource && !isNativeAudio"
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
