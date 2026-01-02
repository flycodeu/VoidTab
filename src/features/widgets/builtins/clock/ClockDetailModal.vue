<script setup lang="ts">
import {ref, onMounted, onUnmounted} from 'vue';
import {PhX, PhClock} from '@phosphor-icons/vue';

const props = defineProps<{
  show: boolean;
}>();
console.log(props)
const emit = defineEmits(['close']);

const fullTime = ref('');
const fullDate = ref('');
let timer: any = null;

const update = () => {
  const now = new Date();
  fullTime.value = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  fullDate.value = now.toLocaleDateString('zh-CN', {year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'});
};

onMounted(() => {
  update();
  timer = setInterval(update, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-md" @click="emit('close')"></div>

      <div
          class="relative w-[400px] bg-[#1a1a1a] border border-white/10 rounded-3xl shadow-2xl p-8 flex flex-col items-center text-white">
        <button
            @click="emit('close')"
            class="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition text-white/40 hover:text-white"
        >
          <PhX size="20"/>
        </button>

        <div class="mb-6 p-4 bg-white/5 rounded-2xl">
          <PhClock size="32" class="text-blue-400" weight="duotone"/>
        </div>

        <div class="text-6xl font-light font-mono tracking-widest mb-4 tabular-nums">
          {{ fullTime }}
        </div>

        <div class="text-lg opacity-60 font-medium mb-2">
          {{ fullDate }}
        </div>

        <div class="mt-8 w-full border-t border-white/5 pt-6 flex justify-around text-xs opacity-40 tracking-widest">
          <div class="flex flex-col items-center">
            <span>24H SYSTEM</span>
            <span class="mt-1 text-blue-400">ACTIVE</span>
          </div>
          <div class="flex flex-col items-center">
            <span>TIMEZONE</span>
            <span class="mt-1">UTC+8</span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>